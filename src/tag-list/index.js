const { CIP } = require("../enip");

const ABtagTypes = {
    TIMER: 0x0f83,
    STRING: 0x0fce,
    PROGRAM: 0x68,
    TASK: 0x70,
    ROUTINE: 0x6d,
    MAP: 0x69
};

const getTypeCodeString = num => {
    if (!Number.isInteger(num)) return null;
    for (let type of Object.keys(ABtagTypes)) {
        if (ABtagTypes[type] === num) return type;
    }
    return null;
};

class TagList {
    constructor () {
        this.tags = [];
    }

  
    /**
     * Generates the CIP message to request a list of tags
     *
     * @param {number} [instanceID = 0] - instance id to start getting a list of object tags
     * @param {string} program - (optional) name of the program to search 
     * @returns {buffer}
     */
    _generateListMessageRequest(instanceID = 0, program) {

        const { LOGICAL, DATA } = CIP.EPATH.segments;

        let pathArray = [];

        if (program) { pathArray.push(DATA.build("Program:" + program)); }

        pathArray.push(LOGICAL.build(LOGICAL.types.ClassID, 0x6b)); //Symbol Class ID
    
        if (instanceID === 0) {
            pathArray.push(Buffer.from([0x25, 0x00, 0x00, 0x00])); //Start at Instance 0;
        } else {
            pathArray.push( LOGICAL.build(LOGICAL.types.InstanceID, instanceID));
        }

        const requestData = Buffer.from([0x02, 0x00, 0x01, 0x00, 0x02, 0x00]); // 2 Attributes - Attribute 1 and Attribute 2
        const request = CIP.MessageRouter.build( CIP.MessageRouter.services.GET_INSTANCE_ATTRIBUTE_LIST, Buffer.concat(pathArray), requestData);

        return request;

    }

    /**
     * Parse CIP response into tag data
     *
     * @param {buffer} data - Buffer data to parse
     * @param {string} program - (optional) name of the program tag is from (optional)
     * @returns {number} Last instance id parsed
     */
    _parseAttributeListResponse(data, program) {
        
        let instanceID;
        let pointer = 0;

        while (pointer < data.length) {

            instanceID = data.readUInt32LE(pointer); //Parse instance ID
            pointer += 4;

            const nameLength = data.readUInt16LE(pointer); // Parse tag Name Length
            pointer += 2;

            const tagName = data.slice(pointer, pointer + nameLength).toString(); // Parse tag Name
            pointer += nameLength;

            const tagType = data.readUInt16LE(pointer); // Parse tag type
            pointer += 2;

            const lastTag = this.tags.findIndex(tag => {
                return (tag.id === instanceID && tag.program === program); 
            });

            const tagObj = {
                id: instanceID,
                name: tagName,
                type: this._parseTagType(tagType),
                program: program 
            };
            
            if (lastTag !== -1) {
                this.tags[lastTag] = tagObj;
            } else {
                this.tags.push(tagObj);
            }
           
        }

        return instanceID; // Return last instance id
    }

    _parseTagType(tagType) {

        const typeCode = tagType & 0x0fff;
        const structure = !!(tagType & 0x8000);
        const reserved = !!(tagType & 0x1000);
        const arrayDims = (tagType & 0x6000) >> 13;

        let typeName = CIP.DataTypes.getTypeCodeString(typeCode);

        if (!typeName) {
            typeName = getTypeCodeString(typeCode);
        }

        return {
            typeCode: typeCode,
            typeName: typeName,
            structure: structure,
            arrayDims: arrayDims,
            reserved: reserved
        };
    }
    /**
     * Parse CIP response into tag data
     *
     * @param {node-ethernet-ip.Controller} PLC - Controller to get tags from
     * @param {string} [program = null] - (optional) name of the program tag is from (optional)
     * @returns {Promise}
     */
    getControllerTags(PLC, program = null) {
        return new Promise( (resolve, reject) => {

            const getListAt = (instanceID = 0) => { // Create function that we can call back in recursion

                const cipData = this._generateListMessageRequest(instanceID, program); // Create CIP Request
        
                PLC.write_cip(cipData); // Write CIP data to PLC
                
                // Response Handler
                PLC.on("Get Instance Attribute List", async (err, data) => {

                    PLC.removeAllListeners("Get Instance Attribute List");  // Make sure we don't handle future calls in this instance

                    // Check For actual error (Skip too much data)
                    if (err && err.generalStatusCode !== 6) {
                        reject(err);
                        return;
                    }

                    // If too much data, call function again starting at last instance + 1
                    if (err && err.generalStatusCode === 6) {

                        const lastInstance = this._parseAttributeListResponse(data, program); // Parse response data
                        getListAt(lastInstance + 1);

                    } else {

                        this._parseAttributeListResponse(data, program); // pArse response data

                        // If program is not defined fetch tags for existing programs
                        if (!program) {
                            for (let prg of this.programs) {
                                await this.getControllerTags(PLC, prg);
                            }
                        }

                        resolve(this.tags);
                    }
                });
            };

            getListAt(0); // Call first time

        });
    }

    /**
     * Gets Controller Program Names
     * 
     * @returns {array[string]}
     */
    get programs() {
        return this.tags.filter(tag => tag.name.slice(0, 8) === "Program:").map(tag => {
            return tag.name.slice(8, tag.length);
        });
    }
  
}

module.exports = TagList;
