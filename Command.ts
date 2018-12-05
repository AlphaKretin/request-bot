import * as Eris from "eris";

interface IPermissionMap {
    [guildID: string]: {
        [channelID: string]: string[];
    };
}

export class Command {
    public names: string[];
    private func: (msg: Eris.Message, args: string[]) => Promise<void | Eris.MessageContent>;
    private condition?: (msg: Eris.Message) => boolean;
    private opts?: {
        argsRequired?: boolean;
        description?: string;
        fullDescription?: string;
        usage?: string;
    };
    constructor(
        names: string[],
        func: (msg: Eris.Message, args: string[]) => Promise<void | Eris.MessageContent>,
        condition?: (msg: Eris.Message) => boolean,
        opts?: any
    ) {
        if (names.length === 0) {
            throw new Error("No names defined!");
        }
        this.names = names;
        this.func = func;
        if (condition) {
            this.condition = condition;
        }
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
        return this.condition ? this.condition(msg) : true;
    }
}
