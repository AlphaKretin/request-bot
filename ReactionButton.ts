import * as Eris from "eris";

export type ReactionFunc = (msg: Eris.Message, args: string[], userID: string) => Promise<void | Eris.MessageContent>;

export class ReactionButton {
    public name: string;
    private func: ReactionFunc;
    private hostMsg: Eris.Message;
    private hostArgs: string[];
    constructor(msg: Eris.Message, args: string[], emoji: string, fun: ReactionFunc) {
        this.hostMsg = msg;
        this.hostArgs = args;
        this.func = fun;
        this.name = emoji;
    }
    public async execute(userID: string): Promise<void> {
        const result = await this.func(this.hostMsg, this.hostArgs, userID);
        if (result !== undefined) {
            this.hostMsg.edit(result);
        }
    }

    get id() {
        return this.hostMsg.id;
    }
}
