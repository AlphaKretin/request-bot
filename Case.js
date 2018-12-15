"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const anchorme_1 = require("anchorme");
const options_1 = require("./options");
exports.pins = {};
class Case {
    constructor(nUserID, nFile, nHistory, nIDs) {
        this.history = [];
        this.userID = nUserID;
        // if being restored from JSON
        if (nFile) {
            this.file = nFile;
        }
        if (nHistory) {
            this.history = nHistory;
        }
        this.ids = {};
        if (nIDs) {
            this.ids = nIDs;
        }
    }
    static messageToPreview(msg) {
        let content = msg.content.slice(0, 20);
        if (content !== msg.content) {
            content += "...";
        }
        const hasAttachment = !!msg.attachment;
        return {
            content,
            hasAttachment,
            userSent: msg.userSent
        };
    }
    static getMessageFile(msg) {
        if (msg.attachments.length > 0) {
            return msg.attachments[0].url;
        }
        const urls = anchorme_1.default(msg.content, options_1.anchorOpts);
        if (urls.length > 0) {
            return urls[0].raw;
        }
    }
    toJSON() {
        return {
            file: this.file,
            history: this.history,
            ids: this.ids,
            isCase: true,
            userID: this.userID
        };
    }
    get hist() {
        return this.history.map(m => Case.messageToPreview(m));
    }
    log(msg, userSent, content) {
        const file = Case.getMessageFile(msg);
        let pin = false;
        if (userSent) {
            if (file && this.file) {
                return [false, false];
            }
            this.file = file;
            if (file) {
                pin = true;
            }
        }
        const message = {
            attachment: file,
            content: content || msg.content,
            date: new Date(msg.timestamp),
            userSent
        };
        if (this.history.length === 0) {
            pin = true;
        }
        this.history.push(message);
        return [true, pin];
    }
    msgAt(index) {
        return this.history[index];
    }
    clearFile() {
        this.file = undefined;
    }
}
exports.Case = Case;
//# sourceMappingURL=Case.js.map