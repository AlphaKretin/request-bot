import anchorme from "anchorme";
import * as Eris from "eris";

const anchorOpts = {
    emails: false,
    files: false,
    ips: false,
    list: true
};

export interface ICaseMessage {
    attachment?: string;
    content: string;
    date: Date;
    userSent: boolean;
}

export interface ICaseMessagePreview {
    content: string;
    hasAttachment: boolean;
    userSent: boolean;
}

export class Case {
    private static messageToPreview(msg: ICaseMessage): ICaseMessagePreview {
        let content: string = msg.content.slice(0, 20);
        if (content !== msg.content) {
            content += "...";
        }
        const hasAttachment: boolean = !!msg.attachment;
        return {
            content,
            hasAttachment,
            userSent: msg.userSent
        };
    }
    private static getMessageFile(msg: Eris.Message): string | undefined {
        if (msg.attachments.length > 0) {
            return msg.attachments[0].url;
        }
        const urls = anchorme(msg.content, anchorOpts);
        if (urls.length > 0) {
            return urls[0].raw;
        }
    }
    public userID: string;
    public file?: string;
    private history: ICaseMessage[] = [];
    constructor(nUserID: string, nFile?: string, nHistory?: ICaseMessage[]) {
        this.userID = nUserID;
        // if being restored from JSON
        if (nFile) {
            this.file = nFile;
        }
        if (nHistory) {
            this.history = nHistory;
        }
    }

    public toJSON() {
        return {
            file: this.file,
            history: this.history,
            isCase: true, // flag for deserialisation
            userID: this.userID
        };
    }

    get hist(): ICaseMessagePreview[] {
        return this.history.map(m => Case.messageToPreview(m));
    }

    public log(msg: Eris.Message, userSent: boolean, content?: string): boolean {
        const file = Case.getMessageFile(msg);
        if (userSent) {
            if (file && this.file) {
                return false;
            }
            this.file = file;
        }
        const message: ICaseMessage = {
            attachment: file,
            content: content || msg.content,
            date: new Date(msg.timestamp),
            userSent
        };
        this.history.push(message);
        return true;
    }

    public msgAt(index: number): ICaseMessage {
        return this.history[index];
    }

    public clearFile(): void {
        this.file = undefined;
    }
}
