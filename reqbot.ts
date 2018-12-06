import anchorme from "anchorme";
import * as Eris from "eris";
import * as fs from "mz/fs";
import { Case, ICaseMessage, ICaseMessagePreview, pins } from "./Case";
import { Command, ICommandOpts } from "./Command";
import { anchorOpts, auth, botOpts, isSentByReviewer, responses, strings, whitelist } from "./options";
import { ReactionButton, ReactionFunc } from "./ReactionButton";

const bot = new Eris.Client(auth.token);
const cases: {
    [userID: string]: Case;
} = JSON.parse(fs.readFileSync("./data/cases.json", "utf8"), (key, value) => {
    if (value.isCase) {
        // if marked as a case
        return new Case(value.userID, value.file, value.history);
    } else if (key === "date") {
        return new Date(value);
    } else {
        return value;
    }
});
const reviewChannels: string[] = JSON.parse(fs.readFileSync("./data/channels.json", "utf8"));
const commands: Command[] = [];
const reactionButtons: {
    [messageID: string]: {
        [emoji: string]: ReactionButton;
    };
} = {};
const reactionTimeouts: {
    [messageID: string]: NodeJS.Timer;
} = {};

async function addReactionButton(msg: Eris.Message, emoji: string, func: ReactionFunc) {
    try {
        await msg.addReaction(emoji);
        const button = new ReactionButton(msg, emoji, func);
        if (!(msg.id in reactionButtons)) {
            reactionButtons[msg.id] = {};
        }
        reactionButtons[msg.id][emoji] = button;
        if (!(msg.id in reactionTimeouts)) {
            const time = setTimeout(async () => {
                await removeButtons(msg);
                delete reactionTimeouts[msg.id];
            }, 1000 * 60);
            reactionTimeouts[msg.id] = time;
        }
    } catch (e) {
        console.error(e);
    }
}

bot.on("connect", () => {
    console.log("Logged in!");
});

bot.on("messageCreate", async msg => {
    if (msg.author.bot) {
        return;
    }
    if (msg.channel instanceof Eris.PrivateChannel) {
        for (const phrase in responses) {
            if (responses.hasOwnProperty(phrase)) {
                if (msg.content.toLowerCase().includes(phrase)) {
                    const chan = await msg.author.getDMChannel();
                    chan.createMessage(responses[phrase]);
                    return;
                }
            }
        }
        if (reviewChannels.length > 0) {
            const severity = validateMessage(msg);
            switch (severity) {
                case messageSeverities.VALID: {
                    const userID = msg.author.id;
                    if (!(userID in cases)) {
                        cases[userID] = new Case(userID);
                    }
                    const [result, pin] = cases[userID].log(msg, true);
                    const userOut: string = result ? strings.requestSuccess : strings.requestReject;
                    msg.channel.createMessage(userOut);
                    if (result) {
                        const entry = cases[userID].msgAt(cases[userID].hist.length - 1);
                        const revOut =
                            strings.requestReceived +
                            msg.author.username +
                            "#" +
                            msg.author.discriminator +
                            "!\n" +
                            detailRequest(entry);
                        for (const channelID of reviewChannels) {
                            try {
                                const sentMsg = await bot.createMessage(channelID, revOut);
                                if (pin) {
                                    sentMsg.pin();
                                }
                            } catch (e) {
                                console.dir(e);
                            }
                        }
                    }
                    fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                    break;
                }
                case messageSeverities.BAD_URL: {
                    const chan = await msg.author.getDMChannel();
                    chan.createMessage(strings.rejectedURL);
                    break;
                }
                case messageSeverities.INVITE_URL: {
                    for (const channelID of reviewChannels) {
                        const user = msg.author;
                        bot.createMessage(
                            channelID,
                            strings.inviteWarning +
                                "\nUser: " +
                                user.username +
                                "#" +
                                user.discriminator +
                                " ID: " +
                                user.id +
                                " Message: \n```" +
                                msg.content +
                                "```"
                        );
                    }
                    break;
                }
                case messageSeverities.SENT_EXE: {
                    for (const channelID of reviewChannels) {
                        const user = msg.author;
                        bot.createMessage(
                            channelID,
                            strings.exeWarning +
                                "\nUser: " +
                                user.username +
                                "#" +
                                user.discriminator +
                                " ID: " +
                                user.id +
                                " Message:\n```" +
                                msg.content +
                                "```\nAttachments: `" +
                                msg.attachments.map(a => a.filename).join("`, `") +
                                "`"
                        );
                    }
                    break;
                }
            }
        } else {
            msg.channel.createMessage(strings.noChannel);
        }
    }
    if (pendingClose && pendingClose.user === msg.author.id) {
        if (msg.content === "yes") {
            if (pendingClose.ids[0] === "all") {
                pendingClose.ids[0] = "all2";
                msg.channel.createMessage(strings.deleteAllDoubleConfirm);
            } else if (pendingClose.ids[0] === "all2") {
                const proms: Array<Promise<void>> = [];
                for (const userID in cases) {
                    if (cases.hasOwnProperty(userID)) {
                        proms.push(closeCase(userID));
                    }
                }
                await Promise.all(proms);
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                msg.channel.createMessage(strings.deletedAll);
            } else {
                let idToDelete = pendingClose.ids.pop();
                const proms: Array<Promise<void>> = [];
                while (idToDelete) {
                    proms.push(closeCase(idToDelete));
                    idToDelete = pendingClose.ids.pop();
                }
                await Promise.all(proms);
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                msg.channel.createMessage(strings.deletedCases);
            }
        } else {
            msg.channel.createMessage(strings.cancelClose);
            pendingClose = undefined;
        }
    }
    for (const cmd of commands) {
        for (const name of cmd.names) {
            if (msg.content.startsWith(botOpts.prefix + name)) {
                cmd.execute(msg).catch(e => bot.createMessage(msg.channel.id, "Error!\n" + e));
                return;
            }
        }
    }
    if (msg.mentions.includes(bot.user)) {
        for (const cmd of commands) {
            if (cmd.names[0] === "help") {
                cmd.execute(msg);
                return;
            }
        }
        return;
    }
});

bot.on("messageReactionAdd", async (msg: Eris.PossiblyUncachedMessage, emoji: Eris.Emoji, userID: string) => {
    if (userID === bot.user.id) {
        return;
    }
    if (reactionButtons[msg.id] && reactionButtons[msg.id][emoji.name]) {
        reactionButtons[msg.id][emoji.name].execute(userID);
    }
});

bot.on("channelDelete", (channel: Eris.AnyChannel) => {
    const index = reviewChannels.indexOf(channel.id);
    if (index > -1) {
        reviewChannels.splice(index);
    }
});

bot.on("messageDelete", (msg: Eris.PossiblyUncachedMessage) => {
    if (reactionButtons[msg.id]) {
        delete reactionButtons[msg.id];
    }
});

async function closeCase(userID: string): Promise<void> {
    const user = bot.users.get(userID);
    if (user) {
        user.getDMChannel().then(chan => {
            chan.createMessage(strings.userCaseDeleted);
        });
    }
    if (userID in pins) {
        for (const chanID of reviewChannels) {
            for (const msgID of pins[chanID][userID]) {
                const msg = await bot.getMessage(chanID, msgID);
                if (msg) {
                    msg.unpin();
                }
            }
        }
    }
    delete cases[userID];
}

async function removeButtons(msg: Eris.Message): Promise<void> {
    await msg.removeReactions();
    delete reactionButtons[msg.id];
}

function getUser(query: string): Eris.User | undefined {
    // try for userID
    const idUser = bot.users.get(query);
    if (idUser) {
        return idUser;
    }
    // try for mention
    const mentionUser = bot.users.find(u => u.mention === query);
    if (mentionUser) {
        return mentionUser;
    }
    // try for name
    const nameUser = bot.users.find(u => u.username.toLowerCase() === query.toLowerCase());
    if (nameUser) {
        return nameUser;
    }
}

const escapeReg = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
// https://gist.github.com/drakantas/ec2c524b95a688b1618d7cc810d490c4
const discordReg = /discord(?:app\.com|\.gg)[\/invite\/]?(?:(?!.*[Ii10OolL]).[a-zA-Z0-9]{5,6}|[a-zA-Z0-9\-]{2,32})/gi;

enum messageSeverities {
    VALID = 0,
    BAD_URL = 1,
    INVITE_URL = 2,
    SENT_EXE = 3
}

function validateMessage(msg: Eris.Message): number {
    const urls = anchorme(msg.content, anchorOpts);
    let severity = messageSeverities.VALID;
    for (const att of msg.attachments) {
        // surely there's a better way but hells if I want to download the potential virus to scan it
        if (att.filename.endsWith(".exe")) {
            return messageSeverities.SENT_EXE;
        }
    }
    for (const url of urls) {
        if (discordReg.test(url.encoded)) {
            severity = Math.max(severity, messageSeverities.INVITE_URL);
        }
        let safe = false;
        for (const domain of whitelist) {
            const re = new RegExp(escapeReg(domain), "gi");
            if (re.test(url.encoded)) {
                safe = true;
            }
        }
        if (!safe) {
            severity = Math.max(severity, messageSeverities.BAD_URL);
        }
    }
    return severity;
}

function registerCommand(
    names: string | string[],
    func: (msg: Eris.Message, args: string[]) => Promise<void | Eris.MessageContent>,
    opts?: ICommandOpts
) {
    const name = typeof names === "string" ? [names] : names;
    commands.push(new Command(name, func, undefined, opts));
}

registerCommand(
    "help",
    async (msg, args) => {
        if (args.length === 0) {
            let out = "**" + bot.user.username + "** - " + strings.botDescription + "\n";
            out += "by " + strings.botOwner + "\n\n";
            if (isSentByReviewer(msg)) {
                out += "**Commands**\n";
                out += commands
                    .map(c => {
                        let profile = "  **" + botOpts.prefix + c.names[0] + "**";
                        if (c.opts && c.opts.description) {
                            profile += " - " + c.opts.description;
                        }
                        return profile;
                    })
                    .join("\n");
                out += '\n\nType "' + botOpts.prefix + 'help [command]" for more info on a specific command';
            } else {
                out += "Please message me only if you have a custom card to request.";
            }
            return out;
        }
        const cmd = commands.find(c => c.names.includes(args[0].toLowerCase()));
        if (cmd !== undefined && isSentByReviewer(msg)) {
            let out = "**" + botOpts.prefix + cmd.names[0] + "** ";
            if (cmd.opts) {
                if (cmd.opts.usage) {
                    out += cmd.opts.usage;
                }
                if (cmd.opts.fullDescription) {
                    out += "\n" + cmd.opts.fullDescription;
                } else if (cmd.opts.description) {
                    out += "\n" + cmd.opts.description;
                }
            }
        }
    },
    {
        argsRequired: false,
        description: "This help command.",
        fullDescription: "Displays information about the bot and its commands.",
        usage: "[command]"
    }
);

registerCommand(
    "reply",
    async (msg, args) => {
        const user = getUser(args[0]);
        const userID = user && user.id;
        const response = args.slice(1).join(" ");
        const username = user ? user.username : "that user";
        if (!(userID && userID in cases)) {
            return strings.noOpenCase + username + "!";
        }
        cases[userID].log(msg, false, response);
        fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
        const channel = await user!.getDMChannel();
        await channel.createMessage(strings.reviewerReponse + "\n" + response);
        return strings.replySent + username + "!";
    },
    {
        argsRequired: true,
        description: strings.replyDesc,
        fullDescription: strings.replyDesc,
        usage: strings.replyUsage
    }
);

registerCommand(
    "clear",
    async (msg, args) => {
        const user = getUser(args[0]);
        const userID = user && user.id;
        const username = user ? user.username : "that user";
        if (!(userID && userID in cases)) {
            return strings.noOpenCase + username + "!";
        }
        cases[userID].clearFile();
        if (userID in pins) {
            for (const msgID of pins[userID][msg.channel.id]) {
                const mes = await bot.getMessage(msg.channel.id, msgID);
                if (mes) {
                    mes.unpin();
                }
            }
        }
        fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
        const channel = await user!.getDMChannel();
        channel.createMessage(strings.userFileCleared);
        return strings.reviewerFileCleared + username + "!";
    },
    {
        argsRequired: true,
        description: strings.clearDesc,
        fullDescription: strings.clearDesc,
        usage: strings.clearUsage
    }
);

let pendingClose: { user: string; ids: string[] } | undefined;

interface IUserReference {
    id: string;
    name: string;
}

registerCommand(
    "close",
    async (msg, args) => {
        if (args[0] === "all") {
            pendingClose = {
                ids: ["all"],
                user: msg.author.id
            };
            return strings.deleteAllConfirm;
        } else {
            const validUsers: IUserReference[] = [];
            const invalidUsers: string[] = [];
            for (const query of args) {
                const user = getUser(query);
                const userID = user && user.id;
                if (userID && userID in cases) {
                    const reference: IUserReference = {
                        id: userID,
                        name: user!.username
                    };
                    validUsers.push(reference);
                } else {
                    invalidUsers.push(query);
                }
            }
            let out: string = "";
            if (invalidUsers.length > 0) {
                out += strings.deleteInvalidUsers + "\n" + invalidUsers.join(", ");
            }
            if (validUsers.length > 0) {
                out += strings.deleteUserConfirmation + "\n" + validUsers.map(u => u.name).join(", ");
                pendingClose = { user: msg.author.id, ids: validUsers.map(u => u.id) };
            }
            return out;
        }
    },
    {
        argsRequired: true,
        description: strings.closeDesc,
        fullDescription: strings.closeDesc,
        usage: strings.closeUsage
    }
);

interface IHistoryPage {
    index: number;
    hist: ICaseMessagePreview[];
    user: string;
}

const historyPages: {
    [channelID: string]: IHistoryPage;
} = {};

function generateHistoryPage(page: IHistoryPage): string {
    const user = bot.users.get(page.user);
    const name = user ? user.username + "#" + user.discriminator : "User " + page.user;
    let out =
        "**Request history for " +
        name +
        "**\nPage " +
        // don't use ceil because 0 should go to 1
        (Math.floor(page.index / 10) + 1) +
        "/" +
        Math.ceil(page.hist.length / 10) +
        "\n";
    for (let i = page.index; i < page.index + 10 && i < page.hist.length; i++) {
        const j = i - page.index + 1;
        const entry = page.hist[i];
        out += `${j}: (${entry.userSent ? "User" : "Reviewer"})\t${entry.content}`;
        if (entry.hasAttachment) {
            out += " (A)";
        }
        out += "\n";
    }
    return out;
}

function detailHistoryEntry(page: IHistoryPage, index: number): string | undefined {
    const entry = cases[page.user].msgAt(page.index + index);
    if (entry) {
        const out = detailRequest(entry);
        return out;
    }
}

function detailRequest(entry: ICaseMessage): string {
    let out = "Message sent at " + entry.date.toUTCString() + ", by " + (entry.userSent ? "user" : "reviewers") + ":\n";
    out += "```\n" + entry.content + "```\n";
    if (entry.attachment) {
        out += "Includes attachment: <" + entry.attachment + ">";
    }
    return out;
}

async function addHistoryButtons(msg: Eris.Message) {
    await removeButtons(msg);
    const page = historyPages[msg.channel.id];
    if (page.index > 0) {
        await addReactionButton(msg, "⬅", async (ms, uID) => {
            if (ms.author.id === uID) {
                historyPages[ms.channel.id].index -= 10;
                if (historyPages[ms.channel.id].index < 0) {
                    historyPages[ms.channel.id].index = 0;
                }
                addHistoryButtons(ms);
                return generateHistoryPage(historyPages[ms.channel.id]);
            }
        });
    }
    if (page.index + 10 < page.hist.length) {
        await addReactionButton(msg, "➡", async (ms, uID) => {
            if (ms.author.id === uID) {
                const tentativeIndex = historyPages[msg.channel.id].index + 10;
                if (tentativeIndex < historyPages[msg.channel.id].hist.length) {
                    historyPages[msg.channel.id].index = tentativeIndex;
                }
                addHistoryButtons(ms);
                return generateHistoryPage(historyPages[msg.channel.id]);
            }
        });
    }
    for (let i = 1; i < 10; i++) {
        if (page.index + i - 1 < page.hist.length) {
            await addReactionButton(msg, `${i}\u20e3`, async ms => {
                addHistoryButtons(ms);
                return detailHistoryEntry(historyPages[msg.channel.id], i - 1);
            });
        }
    }
    if (page.index + 9 < page.hist.length) {
        await addReactionButton(msg, "🔟", async ms => {
            addHistoryButtons(ms);
            return detailHistoryEntry(historyPages[msg.channel.id], 9);
        });
    }
}

registerCommand(
    ["hist", "history", "viewcase"],
    async (msg, args) => {
        const user = getUser(args[0]);
        const userID = user && user.id;
        const username = user ? user.username : "that user";
        if (!(userID && userID in cases)) {
            return strings.noOpenCase + username + "!";
        }
        historyPages[msg.channel.id] = { index: 0, hist: cases[userID].hist, user: userID };
        const out = generateHistoryPage(historyPages[msg.channel.id]);
        const newM = await msg.channel.createMessage(out);
        addHistoryButtons(newM);
    },
    {
        argsRequired: true,
        description: strings.histDesc,
        fullDescription: strings.histDesc,
        usage: strings.histUsage
    }
);

registerCommand(
    "register",
    msg => {
        if (reviewChannels.includes(msg.channel.id)) {
            reviewChannels.splice(reviewChannels.indexOf(msg.channel.id));
            fs.writeFile("./data/channels.json", JSON.stringify(reviewChannels, null, 4));
            return strings.channelUnregister;
        } else {
            reviewChannels.push(msg.channel.id);
            fs.writeFile("./data/channels.json", JSON.stringify(reviewChannels, null, 4));
            return strings.channelRegister;
        }
    },
    {
        description: strings.registerDesc,
        fullDescription: strings.registerDesc
    }
);

const caseLists: {
    [channelID: string]: number;
} = {};

function getCaseList(index: number): string[] {
    return Object.values(cases)
        .map(value => {
            const user = getUser(value.userID);
            const username = user ? user.username : value.userID;
            return username + "\t(Last message: " + value.msgAt(value.hist.length - 1).date.toUTCString() + ");";
        })
        .slice(index, index + 9);
}

function generateCaseList(channelID: string): string {
    const caseList = getCaseList(caseLists[channelID]);
    let out: string = strings.caseListHeader;
    out +=
        " (Page " +
        (Math.floor(caseLists[channelID] / 10) + 1) +
        "/" +
        Math.ceil(Object.keys(cases).length / 10) +
        ")\n";
    out += caseList.join("\n");
    return out;
}

async function addListButtons(msg: Eris.Message) {
    await removeButtons(msg);
    const index = caseLists[msg.channel.id];
    if (index > 0) {
        await addReactionButton(msg, "⬅", async ms => {
            caseLists[msg.channel.id] -= 10;
            if (caseLists[msg.channel.id] < 0) {
                caseLists[msg.channel.id] = 0;
            }
            addListButtons(ms);
            return generateCaseList(msg.channel.id);
        });
    }
    if (index + 10 < Object.keys(cases).length) {
        await addReactionButton(msg, "➡", async ms => {
            const tentativeIndex = caseLists[msg.channel.id] + 10;
            if (tentativeIndex < Object.keys(cases).length) {
                caseLists[msg.channel.id] = tentativeIndex;
            }
            addListButtons(ms);
            return generateCaseList(msg.channel.id);
        });
    }
}

registerCommand(
    ["list", "cases"],
    async msg => {
        if (Object.keys(cases).length < 1) {
            return strings.noCases;
        }
        if (!(msg.channel.id in caseLists)) {
            caseLists[msg.channel.id] = 0;
        }
        addListButtons(msg);
        const out = generateCaseList(msg.channel.id);
        const newM = await msg.channel.createMessage(out);
        addListButtons(newM);
    },
    {
        description: strings.listDesc,
        fullDescription: strings.listDesc
    }
);

function getChannelByID(id: string): Eris.Channel | undefined {
    for (const guild of bot.guilds) {
        const chan = guild[1].channels.get(id);
        if (chan) {
            return chan;
        }
    }
}

registerCommand("chan", async msg => {
    const channels = reviewChannels.map(id => {
        const chan = getChannelByID(id);
        if (chan && chan instanceof Eris.TextChannel) {
            return chan.guild.name + "#" + chan.name + " (" + id + ")";
        }
        return id;
    });
    return "**List of registered channels**:\n" + channels.join("\n");
});

bot.connect();
