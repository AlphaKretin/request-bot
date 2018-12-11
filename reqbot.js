"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const anchorme_1 = require("anchorme");
const Eris = require("eris");
const fs = require("mz/fs");
const Case_1 = require("./Case");
const Command_1 = require("./Command");
const options_1 = require("./options");
const ReactionButton_1 = require("./ReactionButton");
const bot = new Eris.Client(options_1.auth.token);
const cases = JSON.parse(fs.readFileSync("./data/cases.json", "utf8"), (key, value) => {
    if (value.isCase) {
        // if marked as a case
        return new Case_1.Case(value.userID, value.file, value.history);
    }
    else if (key === "date") {
        return new Date(value);
    }
    else {
        return value;
    }
});
const reviewChannels = JSON.parse(fs.readFileSync("./data/channels.json", "utf8"));
const commands = [];
const reactionButtons = {};
const reactionTimeouts = {};
async function addReactionButton(msg, emoji, func) {
    try {
        await msg.addReaction(emoji);
        const button = new ReactionButton_1.ReactionButton(msg, emoji, func);
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
    }
    catch (e) {
        console.error(e);
    }
}
bot.on("connect", () => {
    console.log("Logged in!");
});
bot.on("messageCreate", async (msg) => {
    if (msg.author.bot) {
        return;
    }
    if (msg.channel instanceof Eris.PrivateChannel) {
        if (reviewChannels.length > 0) {
            const severity = validateMessage(msg);
            switch (severity) {
                case messageSeverities.VALID: {
                    const content = msg.content.replace("`", "");
                    for (const phrase in options_1.responses) {
                        if (options_1.responses.hasOwnProperty(phrase)) {
                            if (content.toLowerCase().includes(phrase)) {
                                const chan = await msg.author.getDMChannel();
                                chan.createMessage(options_1.responses[phrase]);
                                return;
                            }
                        }
                    }
                    const userID = msg.author.id;
                    if (!(userID in cases)) {
                        cases[userID] = new Case_1.Case(userID);
                    }
                    const [result, pin] = cases[userID].log(msg, true);
                    const userOut = result ? options_1.strings.requestSuccess : options_1.strings.requestReject;
                    msg.channel.createMessage(userOut);
                    if (result) {
                        const entry = cases[userID].msgAt(cases[userID].hist.length - 1);
                        const revOut = options_1.strings.requestReceived +
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
                                    if (!(msg.author.id in Case_1.pins)) {
                                        Case_1.pins[msg.author.id] = {};
                                    }
                                    if (!(sentMsg.channel.id in Case_1.pins[msg.author.id])) {
                                        Case_1.pins[msg.author.id][sentMsg.channel.id] = [];
                                    }
                                    Case_1.pins[msg.author.id][sentMsg.channel.id].push(sentMsg.id);
                                }
                            }
                            catch (e) {
                                console.dir(e);
                            }
                        }
                    }
                    fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                    break;
                }
                case messageSeverities.BAD_URL: {
                    const chan = await msg.author.getDMChannel();
                    chan.createMessage(options_1.strings.rejectedURL);
                    break;
                }
                case messageSeverities.INVITE_URL: {
                    for (const channelID of reviewChannels) {
                        const user = msg.author;
                        bot.createMessage(channelID, options_1.strings.inviteWarning +
                            "\nUser: " +
                            user.username +
                            "#" +
                            user.discriminator +
                            " ID: " +
                            user.id +
                            " Message: \n```" +
                            msg.content +
                            "```");
                    }
                    break;
                }
                case messageSeverities.SENT_EXE: {
                    for (const channelID of reviewChannels) {
                        const user = msg.author;
                        bot.createMessage(channelID, options_1.strings.exeWarning +
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
                            "`");
                    }
                    break;
                }
            }
        }
        else {
            msg.channel.createMessage(options_1.strings.noChannel);
        }
    }
    if (pendingClose && pendingClose.user === msg.author.id) {
        if (msg.content === "yes") {
            let msgs = [];
            if (pendingClose.ids[0] === "all") {
                pendingClose.ids[0] = "all2";
                msg.channel.createMessage(options_1.strings.deleteAllDoubleConfirm);
            }
            else if (pendingClose.ids[0] === "all2") {
                pendingClose = undefined;
                const proms = [];
                for (const userID in cases) {
                    if (cases.hasOwnProperty(userID)) {
                        proms.push(closeCase(userID).then(ms => {
                            if (ms) {
                                msgs = msgs.concat(ms);
                            }
                        }));
                    }
                }
                await Promise.all(proms);
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                let out = options_1.strings.deletedAll;
                if (msgs.length > 0) {
                    out += "\nUnpinned messages:\n";
                    const links = msgs.map(getJumpLink);
                    out += links.join("\n");
                }
                msg.channel.createMessage(out);
            }
            else {
                let idToDelete = pendingClose.ids.pop();
                const proms = [];
                while (idToDelete) {
                    proms.push(closeCase(idToDelete).then(ms => {
                        if (ms) {
                            msgs = msgs.concat(ms);
                        }
                    }));
                    idToDelete = pendingClose.ids.pop();
                }
                pendingClose = undefined;
                await Promise.all(proms);
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                let out = options_1.strings.deletedCases;
                if (msgs.length > 0) {
                    out += "\nUnpinned messages:\n";
                    const links = msgs.map(getJumpLink);
                    out += links.join("\n");
                }
                msg.channel.createMessage(out);
            }
        }
        else {
            msg.channel.createMessage(options_1.strings.cancelClose);
            pendingClose = undefined;
        }
    }
    for (const cmd of commands) {
        for (const name of cmd.names) {
            if (msg.content.startsWith(options_1.botOpts.prefix + name)) {
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
bot.on("messageReactionAdd", async (msg, emoji, userID) => {
    if (userID === bot.user.id) {
        return;
    }
    if (reactionButtons[msg.id] && reactionButtons[msg.id][emoji.name]) {
        reactionButtons[msg.id][emoji.name].execute(userID);
    }
});
bot.on("channelDelete", (channel) => {
    const index = reviewChannels.indexOf(channel.id);
    if (index > -1) {
        reviewChannels.splice(index);
    }
});
bot.on("messageDelete", (msg) => {
    if (reactionButtons[msg.id]) {
        delete reactionButtons[msg.id];
    }
});
async function closeCase(userID) {
    const user = bot.users.get(userID);
    if (user) {
        user.getDMChannel().then(chan => {
            chan.createMessage(options_1.strings.userCaseDeleted);
        });
    }
    const msgs = [];
    if (userID in Case_1.pins) {
        for (const chanID of reviewChannels) {
            for (const msgID of Case_1.pins[userID][chanID]) {
                const msg = await bot.getMessage(chanID, msgID);
                if (msg && msg.pinned) {
                    msgs.push(msg);
                    msg.unpin();
                }
            }
            Case_1.pins[userID][chanID] = [];
        }
    }
    delete cases[userID];
    if (msgs.length > 0) {
        return msgs;
    }
}
async function removeButtons(msg) {
    await msg.removeReactions();
    delete reactionButtons[msg.id];
}
function getUser(query) {
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
const escapeReg = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
// https://gist.github.com/drakantas/ec2c524b95a688b1618d7cc810d490c4
const discordReg = /discord(?:app\.com|\.gg)[\/invite\/]?(?:(?!.*[Ii10OolL]).[a-zA-Z0-9]{5,6}|[a-zA-Z0-9\-]{2,32})/gi;
var messageSeverities;
(function (messageSeverities) {
    messageSeverities[messageSeverities["VALID"] = 0] = "VALID";
    messageSeverities[messageSeverities["BAD_URL"] = 1] = "BAD_URL";
    messageSeverities[messageSeverities["INVITE_URL"] = 2] = "INVITE_URL";
    messageSeverities[messageSeverities["SENT_EXE"] = 3] = "SENT_EXE";
})(messageSeverities || (messageSeverities = {}));
function validateMessage(msg) {
    const urls = anchorme_1.default(msg.content, options_1.anchorOpts);
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
        for (const domain of options_1.whitelist) {
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
function registerCommand(names, func, opts) {
    const name = typeof names === "string" ? [names] : names;
    commands.push(new Command_1.Command(name, func, undefined, opts));
}
registerCommand("help", async (msg, args) => {
    if (args.length === 0) {
        let out = "**" + bot.user.username + "** - " + options_1.strings.botDescription + "\n";
        out += "by " + options_1.strings.botOwner + "\n\n";
        if (options_1.isSentByReviewer(msg)) {
            out += "**Commands**\n";
            out += commands
                .map(c => {
                let profile = "  **" + options_1.botOpts.prefix + c.names[0] + "**";
                if (c.opts && c.opts.description) {
                    profile += " - " + c.opts.description;
                }
                return profile;
            })
                .join("\n");
            out += '\n\nType "' + options_1.botOpts.prefix + 'help [command]" for more info on a specific command';
        }
        else {
            out += "Please message me only if you have a custom card to request.";
        }
        return out;
    }
    const cmd = commands.find(c => c.names.includes(args[0].toLowerCase()));
    if (cmd !== undefined && options_1.isSentByReviewer(msg)) {
        let out = "**" + options_1.botOpts.prefix + cmd.names[0] + "** ";
        if (cmd.opts) {
            if (cmd.opts.usage) {
                out += cmd.opts.usage;
            }
            if (cmd.opts.fullDescription) {
                out += "\n" + cmd.opts.fullDescription;
            }
            else if (cmd.opts.description) {
                out += "\n" + cmd.opts.description;
            }
        }
    }
}, {
    argsRequired: false,
    description: "This help command.",
    fullDescription: "Displays information about the bot and its commands.",
    usage: "[command]"
});
registerCommand("reply", async (msg, args) => {
    const user = getUser(args[0]);
    const userID = user && user.id;
    const response = args.slice(1).join(" ");
    const username = user ? user.username : "that user";
    if (!(userID && userID in cases)) {
        return options_1.strings.noOpenCase + username + "!";
    }
    cases[userID].log(msg, false, response);
    fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
    const channel = await user.getDMChannel();
    await channel.createMessage(options_1.strings.reviewerReponse + "\n" + response);
    return options_1.strings.replySent + username + "!";
}, {
    argsRequired: true,
    description: options_1.strings.replyDesc,
    fullDescription: options_1.strings.replyDesc,
    usage: options_1.strings.replyUsage
});
registerCommand("clear", async (msg, args) => {
    const user = getUser(args[0]);
    const userID = user && user.id;
    const username = user ? user.username : "that user";
    if (!(userID && userID in cases)) {
        return options_1.strings.noOpenCase + username + "!";
    }
    cases[userID].clearFile();
    const msgs = [];
    if (userID in Case_1.pins) {
        for (const msgID of Case_1.pins[userID][msg.channel.id]) {
            const mes = await bot.getMessage(msg.channel.id, msgID);
            if (mes && mes.pinned) {
                mes.unpin();
                msgs.push(mes);
            }
        }
    }
    fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
    const channel = await user.getDMChannel();
    let out = options_1.strings.userFileCleared;
    if (msgs.length > 0) {
        out += "\nUnpinned messages:\n";
        const links = msgs.map(getJumpLink);
        out += links.join("\n");
    }
    channel.createMessage(out);
    return options_1.strings.reviewerFileCleared + username + "!";
}, {
    argsRequired: true,
    description: options_1.strings.clearDesc,
    fullDescription: options_1.strings.clearDesc,
    usage: options_1.strings.clearUsage
});
let pendingClose;
registerCommand("close", async (msg, args) => {
    if (args[0] === "all") {
        pendingClose = {
            ids: ["all"],
            user: msg.author.id
        };
        return options_1.strings.deleteAllConfirm;
    }
    else {
        const validUsers = [];
        const invalidUsers = [];
        for (const query of args) {
            const user = getUser(query);
            const userID = user && user.id;
            if (userID && userID in cases) {
                const reference = {
                    id: userID,
                    name: user.username
                };
                validUsers.push(reference);
            }
            else {
                invalidUsers.push(query);
            }
        }
        let out = "";
        if (invalidUsers.length > 0) {
            out += options_1.strings.deleteInvalidUsers + "\n" + invalidUsers.join(", ");
        }
        if (validUsers.length > 0) {
            out += options_1.strings.deleteUserConfirmation + "\n" + validUsers.map(u => u.name).join(", ");
            pendingClose = { user: msg.author.id, ids: validUsers.map(u => u.id) };
        }
        return out;
    }
}, {
    argsRequired: true,
    description: options_1.strings.closeDesc,
    fullDescription: options_1.strings.closeDesc,
    usage: options_1.strings.closeUsage
});
const historyPages = {};
function generateHistoryPage(page) {
    const user = bot.users.get(page.user);
    const name = user ? user.username + "#" + user.discriminator : "User " + page.user;
    let out = "**Request history for " +
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
function detailHistoryEntry(page, index) {
    const entry = cases[page.user].msgAt(page.index + index);
    if (entry) {
        const out = detailRequest(entry);
        return out;
    }
}
function detailRequest(entry) {
    let out = "Message sent at " + entry.date.toUTCString() + ", by " + (entry.userSent ? "user" : "reviewers") + ":\n";
    out += "```\n" + entry.content + "```\n";
    if (entry.attachment) {
        out += "Includes attachment: <" + entry.attachment + ">";
    }
    return out;
}
async function addHistoryButtons(msg) {
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
            await addReactionButton(msg, `${i}\u20e3`, async (ms) => {
                addHistoryButtons(ms);
                return detailHistoryEntry(historyPages[msg.channel.id], i - 1);
            });
        }
    }
    if (page.index + 9 < page.hist.length) {
        await addReactionButton(msg, "🔟", async (ms) => {
            addHistoryButtons(ms);
            return detailHistoryEntry(historyPages[msg.channel.id], 9);
        });
    }
}
registerCommand(["hist", "history", "viewcase"], async (msg, args) => {
    const user = getUser(args[0]);
    const userID = user && user.id;
    const username = user ? user.username : "that user";
    if (!(userID && userID in cases)) {
        return options_1.strings.noOpenCase + username + "!";
    }
    historyPages[msg.channel.id] = { index: 0, hist: cases[userID].hist, user: userID };
    const out = generateHistoryPage(historyPages[msg.channel.id]);
    const newM = await msg.channel.createMessage(out);
    addHistoryButtons(newM);
}, {
    argsRequired: true,
    description: options_1.strings.histDesc,
    fullDescription: options_1.strings.histDesc,
    usage: options_1.strings.histUsage
});
registerCommand("register", msg => {
    if (reviewChannels.includes(msg.channel.id)) {
        reviewChannels.splice(reviewChannels.indexOf(msg.channel.id));
        fs.writeFile("./data/channels.json", JSON.stringify(reviewChannels, null, 4));
        return options_1.strings.channelUnregister;
    }
    else {
        reviewChannels.push(msg.channel.id);
        fs.writeFile("./data/channels.json", JSON.stringify(reviewChannels, null, 4));
        return options_1.strings.channelRegister;
    }
}, {
    description: options_1.strings.registerDesc,
    fullDescription: options_1.strings.registerDesc
});
const caseLists = {};
function getCaseList(index) {
    return Object.values(cases)
        .map(value => {
        const user = getUser(value.userID);
        const username = user ? user.username : value.userID;
        return username + "\t(Last message: " + value.msgAt(value.hist.length - 1).date.toUTCString() + ");";
    })
        .slice(index, index + 9);
}
function generateCaseList(channelID) {
    const caseList = getCaseList(caseLists[channelID]);
    let out = options_1.strings.caseListHeader;
    out +=
        " (Page " +
            (Math.floor(caseLists[channelID] / 10) + 1) +
            "/" +
            Math.ceil(Object.keys(cases).length / 10) +
            ")\n";
    out += caseList.join("\n");
    return out;
}
async function addListButtons(msg) {
    await removeButtons(msg);
    const index = caseLists[msg.channel.id];
    if (index > 0) {
        await addReactionButton(msg, "⬅", async (ms) => {
            caseLists[msg.channel.id] -= 10;
            if (caseLists[msg.channel.id] < 0) {
                caseLists[msg.channel.id] = 0;
            }
            addListButtons(ms);
            return generateCaseList(msg.channel.id);
        });
    }
    if (index + 10 < Object.keys(cases).length) {
        await addReactionButton(msg, "➡", async (ms) => {
            const tentativeIndex = caseLists[msg.channel.id] + 10;
            if (tentativeIndex < Object.keys(cases).length) {
                caseLists[msg.channel.id] = tentativeIndex;
            }
            addListButtons(ms);
            return generateCaseList(msg.channel.id);
        });
    }
}
registerCommand(["list", "cases"], async (msg) => {
    if (Object.keys(cases).length < 1) {
        return options_1.strings.noCases;
    }
    if (!(msg.channel.id in caseLists)) {
        caseLists[msg.channel.id] = 0;
    }
    addListButtons(msg);
    const out = generateCaseList(msg.channel.id);
    const newM = await msg.channel.createMessage(out);
    addListButtons(newM);
}, {
    description: options_1.strings.listDesc,
    fullDescription: options_1.strings.listDesc
});
function getChannelByID(id) {
    for (const guild of bot.guilds) {
        const chan = guild[1].channels.get(id);
        if (chan) {
            return chan;
        }
    }
}
registerCommand("chan", async (msg) => {
    const channels = reviewChannels.map(id => {
        const chan = getChannelByID(id);
        if (chan && chan instanceof Eris.TextChannel) {
            return chan.guild.name + "#" + chan.name + " (" + id + ")";
        }
        return id;
    });
    return "**List of registered channels**:\n" + channels.join("\n");
}, {
    description: options_1.strings.chanDesc,
    fullDescription: options_1.strings.chanDesc
});
bot.connect();
const getJumpLink = (m) => "<https://discordapp.com/channels/" +
    (m.channel instanceof Eris.GuildChannel ? m.channel.guild.id : "@me") +
    "/" +
    m.channel.id +
    "/" +
    m.id +
    ">";
//# sourceMappingURL=reqbot.js.map