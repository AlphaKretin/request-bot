import * as Eris from "eris";
import * as fs from "mz/fs";

export function isSentByReviewer(msg: Eris.Message) {
    const user = msg.member;
    if (user) {
        const roleIDs = user.roles;
        const chan = msg.channel;
        if (chan instanceof Eris.TextChannel) {
            const roles = chan.guild.roles;
            for (const id of roleIDs) {
                const role = roles.get(id);
                if (role && botOpts.reviewerRoles.includes(role.name)) {
                    return true;
                }
            }
        }
    }
    return false;
}

export const auth = JSON.parse(fs.readFileSync("./conf/auth.json", "utf8"));
export const botOpts = JSON.parse(fs.readFileSync("./conf/opts.json", "utf8"));
export const strings = JSON.parse(fs.readFileSync("./conf/strings.json", "utf8"));
export const responses = JSON.parse(fs.readFileSync("./conf/responses.json", "utf8"));
export const whitelist = JSON.parse(fs.readFileSync("./conf/whitelist.json", "utf8"));
export const anchorOpts = {
    emails: false,
    files: false,
    ips: false,
    list: true
};
