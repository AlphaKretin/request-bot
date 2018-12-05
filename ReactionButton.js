"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ReactionButton {
    constructor(msg, args, emoji, fun) {
        this.hostMsg = msg;
        this.hostArgs = args;
        this.func = fun;
        this.name = emoji;
    }
    async execute(userID) {
        const result = await this.func(this.hostMsg, this.hostArgs, userID);
        if (result !== undefined) {
            this.hostMsg.edit(result);
        }
    }
    get id() {
        return this.hostMsg.id;
    }
}
exports.ReactionButton = ReactionButton;
//# sourceMappingURL=ReactionButton.js.map