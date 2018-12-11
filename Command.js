"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const options_1 = require("./options");
class Command {
    constructor(names, func, condition, opts) {
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
    async execute(msg) {
        if (this.isCanExecute(msg)) {
            const args = msg.content.split(/\s/).slice(1);
            if (args.length === 0 && this.opts && this.opts.argsRequired !== undefined && this.opts.argsRequired) {
                return false;
            }
            const res = await this.func(msg, args);
            if (res !== undefined) {
                await msg.channel.createMessage(res);
                return true;
            }
        }
        return false;
    }
    isCanExecute(msg) {
        return this.permissionCheck(msg) && (this.condition ? this.condition(msg) : true);
    }
    permissionCheck(msg) {
        if (this.names[0] === "help" || msg.author.id === options_1.botOpts.ownerID) {
            return true;
        }
        return options_1.isSentByReviewer(msg);
    }
}
exports.Command = Command;
//# sourceMappingURL=Command.js.map