const { CIP } = require("../enip");

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

            this.tags.push({
                id: instanceID,
                name: tagName,
                type: tagType,
                program: program
            });
        }

        return instanceID; // Return last instance id
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

            const getListAt = (instanceID = 0) => {

                const cipData = this._generateListMessageRequest(instanceID, program);
        
                PLC.write_cip(cipData);

                PLC.on("Get Instance Attribute List", (err, data) => {

                    PLC.removeAllListeners("Get Instance Attribute List");

                    if (err && err.generalStatusCode !== 6) {
                        reject(err);
                        return;
                    }

                    if (err && err.generalStatusCode === 6) {
                        const lastInstance = this._parseAttributeListResponse(data, program);
                        getListAt(lastInstance + 1);
                    } else {
                        this._parseAttributeListResponse(data, program);
                        resolve(this.tags);
                    }
                });
            };

            getListAt(0);

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
