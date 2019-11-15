const { CIP } = require("../enip");
const { MessageRouter } = CIP;
const { WRITE_TAG } = MessageRouter.services;
const Tag = require("../tag");
const Template = require("./template");

class Structure extends Tag {
    constructor (tagname, template, program = null, datatype = null, keepAlive = 0) {
        super(tagname, program, datatype, keepAlive);
        this._template = template;
        
        
    }

    get value () {
        if (!this._template) {
            return super.value;
        } else {
            if (this._template._name === "ASCIISTRING82") {
                return super.value.slice(4, 4 + super.value.readInt32LE()).toString();
            } else {
                return this._parseReadData(super.value, this._template);
            }
        }
    }

    parseValue (data) {
        if (this._template._name === "ASCIISTRING82") {
            return data.slice(4, 4 + data.readInt32LE()).toString();
        } else {
            return this._parseReadData(data, this._template);
        }
    }

    set value (newValue) {
        if (!this._template) {
            super.value = newValue;
        } else {
            if (this._template._name === "ASCIISTRING82") {
                const lengthBuf = Buffer.alloc(4);
                lengthBuf.writeUInt32LE(newValue.length);
                const textBuf = Buffer.from(newValue, "utf8");
                const paddBuf = Buffer.alloc(this._template._attributes.StructureSize - 4 - newValue.length, 0x00);

                super.value = Buffer.concat([lengthBuf, textBuf, paddBuf]);
            } else {
                super.value = this._parseWriteData (newValue, this._template);
            }
        }
    }

    generateWriteMessageRequest(value = null, size = 0x01) {
        const { Types } = CIP.DataTypes;

        if(!this._template) {
            return super.generateReadMessageRequest(value, size);
        } else {
            const { tag } = this.state;
            const buf = Buffer.alloc(6);
            buf.writeUInt16LE(Types.STRUCT, 0);
            buf.writeUInt16LE(this._template._attributes.StructureHandle, 2);
            buf.writeUInt16LE(size, 4);
            
            return MessageRouter.build(WRITE_TAG, tag.path, Buffer.concat([buf, super.value]));  
        }
    }
    
    _parseWriteData (structObj, template) {

    }

    _parseReadData (data, template) {

        let structValues = {};
        
        template._members.forEach(member => {
            switch (member.type.string) {
            case "SINT":
                if (member.info > 0) {
                    structValues[member.name] = data.slice(member.offset, member.offset + member.info);
                } else {
                    structValues[member.name] = data.readInt8(member.offset);
                } 
                break;
            case "INT":
                structValues[member.name] = data.readInt16LE(member.offset);
                break;
            case "DINT":
                structValues[member.name] = data.readUInt32LE(member.offset);
                break;
            case "BIT_STRING":
                structValues[member.name] = data.readUInt32LE(member.offset);
                break;
            case "BOOL":
                structValues[member.name] = !!(data.readUInt8(member.offset) & (1 << member.info));
                break;
            default:
                throw new Error(
                    "Data Type other than SINT, INT, DINT, or BIT_STRING returned when a Bit Index was requested"
                );
            }   
        });

        return structValues;

    }

}



module.exports = { Structure, Template};