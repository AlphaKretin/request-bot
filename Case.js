"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const anchorme_1 = require("anchorme");
const anchorOpts = {
    emails: false,
    files: false,
    ips: false,
    list: true
};
class Case {
    constructor(nUserID, nFile, nHistory) {
        this.history = [];
        this.userID = nUserID;
        // if being restored from JSON
        if (nFile) {
            this.file = nFile;
        }
        if (nHistory) {
            this.history = nHistory;
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
        const urls = anchorme_1.default(msg.content, anchorOpts);
        if (urls.length > 0) {
            return urls[0].raw;
        }
    }
    toJSON() {
        return {
            file: this.file,
            history: this.history,
            isCase: true,
            userID: this.userID
        };
    }
    get hist() {
        return this.history.map(m => Case.messageToPreview(m));
    }
    log(msg, userSent, content) {
        const file = Case.getMessageFile(msg);
        if (userSent) {
            if (file && this.file) {
                return false;
            }
            this.file = file;
        }
        const message = {
            attachment: file,
            content: content || msg.content,
            date: new Date(msg.timestamp),
            userSent
        };
        this.history.push(message);
        return true;
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