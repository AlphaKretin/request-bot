import * as Eris from "eris";
import * as fs from "mz/fs";
import { Case, ICaseMessage, ICaseMessagePreview } from "./Case";

const auth = JSON.parse(fs.readFileSync("./conf/auth.json", "utf8"));
const botOpts = JSON.parse(fs.readFileSync("./conf/opts.json", "utf8"));
const strings = JSON.parse(fs.readFileSync("./conf/strings.json", "utf8"));
const responses = JSON.parse(fs.readFileSync("./conf/responses.json", "utf8"));

const cmdOpts: Eris.CommandClientOptions = {
    defaultCommandOptions: {
        caseInsensitive: true,
        requirements: {
            roleNames: botOpts.reviewerRoles
        }
    },
    description: strings.botDescription,
    owner: strings.botOwner,
    prefix: botOpts.prefix
};
const bot = new Eris.CommandClient(auth.token, undefined, cmdOpts);
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
            const userID = msg.author.id;
            if (!(userID in cases)) {
                cases[userID] = new Case(userID);
            }
            const result = cases[userID].log(msg, true);
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
                    const sentMsg = await bot.createMessage(channelID, revOut);
                    if (entry.attachment !== undefined) {
                        sentMsg.pin();
                    }
                }
            }
            fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
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
                for (const userID in cases) {
                    if (cases.hasOwnProperty(userID)) {
                        delete cases[userID];
                    }
                }
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                msg.channel.createMessage(strings.deletedAll);
            } else {
                let idToDelete = pendingClose.ids.pop();
                while (idToDelete) {
                    delete cases[idToDelete];
                    idToDelete = pendingClose.ids.pop();
                }
                fs.writeFile("./data/cases.json", JSON.stringify(cases, null, 4));
                msg.channel.createMessage(strings.deletedCases);
            }
        } else {
            // will fire for initial message that makes the pendingClose
            // so this originally always closed itself before you could confirm
            pendingClose.ignores++;
            if (pendingClose.ignores > 2) {
                pendingClose = undefined;
            }
        }
    }
});

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

bot.registerCommand(
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

bot.registerCommand(
    "clear",
    async (_, args) => {
        const user = getUser(args[0]);
        const userID = user && user.id;
        const username = user ? user.username : "that user";
        if (!(userID && userID in cases)) {
            return strings.noOpenCase + username + "!";
        }
        cases[userID].clearFile();
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

let pendingClose: { user: string; ids: string[]; ignores: number } | undefined;

interface IUserReference {
    id: string;
    name: string;
}

bot.registerCommand(
    "close",
    async (msg, args) => {
        if (args[0] === "all") {
            pendingClose = {
                ids: ["all"],
                ignores: 0,
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
                pendingClose = { user: msg.author.id, ids: validUsers.map(u => u.id), ignores: 0 };
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
    // don't use ceil because 0 should go to 1
    let out = "Page " + (Math.floor(page.index / 10) + 1) + "/" + Math.ceil(page.hist.length / 10) + "\n";
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

bot.registerCommand(
    "hist",
    (msg, args) => {
        const user = getUser(args[0]);
        const userID = user && user.id;
        const username = user ? user.username : "that user";
        if (!(userID && userID in cases)) {
            return strings.noOpenCase + username + "!";
        }
        historyPages[msg.channel.id] = { index: 0, hist: cases[userID].hist, user: userID };
        return generateHistoryPage(historyPages[msg.channel.id]);
    },
    {
        aliases: ["history", "viewcase"],
        argsRequired: true,
        description: strings.histDesc,
        fullDescription: strings.histDesc,
        reactionButtons: [
            {
                emoji: "⬅",
                response: msg => {
                    historyPages[msg.channel.id].index -= 10;
                    if (historyPages[msg.channel.id].index < 0) {
                        historyPages[msg.channel.id].index = 0;
                    }
                    return generateHistoryPage(historyPages[msg.channel.id]);
                },
                type: "edit"
            },
            {
                emoji: "➡",
                response: msg => {
                    const tentativeIndex = historyPages[msg.channel.id].index + 10;
                    if (tentativeIndex < historyPages[msg.channel.id].hist.length) {
                        historyPages[msg.channel.id].index = tentativeIndex;
                    }
                    return generateHistoryPage(historyPages[msg.channel.id]);
                },
                type: "edit"
            },
            {
                emoji: "1\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 0),
                type: "edit"
            },
            {
                emoji: "2\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 1),
                type: "edit"
            },
            {
                emoji: "3\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 2),
                type: "edit"
            },
            {
                emoji: "4\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 3),
                type: "edit"
            },
            {
                emoji: "5\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 4),
                type: "edit"
            },
            {
                emoji: "6\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 5),
                type: "edit"
            },
            {
                emoji: "7\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 6),
                type: "edit"
            },
            {
                emoji: "8\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 7),
                type: "edit"
            },
            {
                emoji: "9\u20e3",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 8),
                type: "edit"
            },
            {
                emoji: "🔟",
                response: msg => detailHistoryEntry(historyPages[msg.channel.id], 9),
                type: "edit"
            }
        ],
        usage: strings.histUsage
    }
);

bot.registerCommand(
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
            return username + "\t(Last message: " + value.msgAt(value.hist.length - 1).date.toUTCString() + "));";
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

bot.registerCommand(
    "list",
    msg => {
        if (Object.keys(cases).length < 1) {
            return strings.noCases;
        }
        if (!(msg.channel.id in caseLists)) {
            caseLists[msg.channel.id] = 0;
        }
        return generateCaseList(msg.channel.id);
    },
    {
        description: strings.listDesc,
        fullDescription: strings.listDesc,
        reactionButtons: [
            {
                emoji: "⬅",
                response: msg => {
                    caseLists[msg.channel.id] -= 10;
                    if (caseLists[msg.channel.id] < 0) {
                        caseLists[msg.channel.id] = 0;
                    }
                    return generateCaseList(msg.channel.id);
                },
                type: "edit"
            },
            {
                emoji: "➡",
                response: msg => {
                    const tentativeIndex = caseLists[msg.channel.id] + 10;
                    if (tentativeIndex < Object.keys(cases).length) {
                        caseLists[msg.channel.id] = tentativeIndex;
                    }
                    return generateCaseList(msg.channel.id);
                },
                type: "edit"
            }
        ]
    }
);

bot.connect();
