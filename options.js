"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Eris = require("eris");
const fs = require("mz/fs");
function isSentByReviewer(msg) {
    const user = msg.member;
    if (user) {
        const roleIDs = user.roles;
        const chan = msg.channel;
        if (chan instanceof Eris.TextChannel) {
            const roles = chan.guild.roles;
            for (const id of roleIDs) {
                const role = roles.get(id);
                if (role && exports.botOpts.reviewerRoles.includes(role.name)) {
                    return true;
                }
            }
        }
    }
    return false;
}
exports.isSentByReviewer = isSentByReviewer;
exports.auth = JSON.parse(fs.readFileSync("./conf/auth.json", "utf8"));
exports.botOpts = JSON.parse(fs.readFileSync("./conf/opts.json", "utf8"));
exports.strings = JSON.parse(fs.readFileSync("./conf/strings.json", "utf8"));
exports.responses = JSON.parse(fs.readFileSync("./conf/responses.json", "utf8"));
//# sourceMappingURL=options.js.map