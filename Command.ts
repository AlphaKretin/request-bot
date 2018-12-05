import * as Eris from "eris";
import { isSentByReviewer } from "./options";

export interface ICommandOpts {
    argsRequired?: boolean;
    description?: string;
    fullDescription?: string;
    usage?: string;
}

export class Command {
    public opts?: ICommandOpts;
    public names: string[];
    private func: (msg: Eris.Message, args: string[]) => Promise<void | Eris.MessageContent>;
    private condition?: (msg: Eris.Message) => boolean;
    constructor(
        names: string[],
        func: (msg: Eris.Message, args: string[]) => Promise<void | Eris.MessageContent>,
        condition?: (msg: Eris.Message) => boolean,
        opts?: ICommandOpts
    ) {
        if (names.length === 0) {
            throw new Error("No names defined!");
        }
        this.names = names;
        this.func = func;
        if (condition) {
            this.condition = condition;
        }
        this.opts = opts;
    }

    public async execute(msg: Eris.Message): Promise<void> {
        if (this.isCanExecute(msg)) {
            const args = msg.content.split(/\s/).slice(1);
            if (args.length === 0 && this.opts && this.opts.argsRequired !== undefined && this.opts.argsRequired) {
                return;
            }
            const res = await this.func(msg, args);
            if (res !== undefined) {
                msg.channel.createMessage(res);
            }
        } else {
            throw new Error("Forbidden");
        }
    }

    private isCanExecute(msg: Eris.Message): boolean {
        return this.permissionCheck(msg) && (this.condition ? this.condition(msg) : true);
    }

    private permissionCheck(msg: Eris.Message): boolean {
        if (this.names[0] === "help") {
            return true;
        }
        return isSentByReviewer(msg);
    }
}
