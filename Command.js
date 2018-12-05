"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
                return;
            }
            const res = await this.func(msg, args);
            if (res !== undefined) {
                msg.channel.createMessage(res);
            }
        }
        else {
            throw new Error("Forbidden");
        }
    }
    isCanExecute(msg) {
        return this.condition ? this.condition(msg) : true;
    }
}
exports.Command = Command;
//# sourceMappingURL=Command.js.map