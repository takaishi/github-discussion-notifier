const https = require('https');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const ssmClient = new AWS.SSM({apiVersion: '2014-11-06', region: 'ap-northeast-1'})

const SLACK_CHANNEL = process.env.SLACK_CHANNEL

async function slackBotToken() {
    if (process.env.SLACK_BOT_TOKEN) {
        return process.env.SLACK_BOT_TOKEN
    } else {
        params = {
            Name: process.env.PARAMETER_STORE_SLACK_BOT_TOKEN,
            WithDecryption: true
        }
        const data = await ssmClient.getParameter(params).promise()
        return data.Parameter.Value
    }
}

async function secretToken() {
    if (process.env.SECRET_TOKEN) {
        return process.env.SECRET_TOKEN
    } else {
        params = {
            Name: process.env.PARAMETER_STORE_SECRET_TOKEN,
            WithDecryption: true
        }
        const data = await ssmClient.getParameter(params).promise()
        return data.Parameter.Value
    }
}

function getEventPayload(event) {
    if (event.isBase64Encoded) {
        let buff = Buffer.from(event.body, "base64");
        let eventBodyStr = buff.toString('UTF-8');
        return JSON.parse(eventBodyStr)
    } else {
        return JSON.parse(event.body)
    }
}

function payloadForDiscussionCreated(eventPayload) {
    const discussionOwner = `<${eventPayload.discussion.user.html_url}|${eventPayload.discussion.user.login}>`
    return {
        channel: SLACK_CHANNEL,
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `New discussion created by ${discussionOwner}`
                }
            }
        ],
        attachments: [
            {
                "color": "#008000",
                "title": `#${eventPayload.discussion.number} ${eventPayload.discussion.title}`,
                "title_link": eventPayload.discussion.html_url,
                "text": eventPayload.discussion.body,
                fields: [
                    {
                        "title": "Category",
                        "value": `${eventPayload.discussion.category.emoji} ${eventPayload.discussion.category.name}`,
                        "short": false
                    },
                ]
            }
        ]
    }
}

function payloadForCommentCreated(eventPayload) {
    const discussionOwner = `<${eventPayload.discussion.user.html_url}|${eventPayload.discussion.user.login}'s>`
    const commentOwner = `<${eventPayload.comment.user.html_url}|${eventPayload.comment.user.login}>`

    return {
        channel: SLACK_CHANNEL,
        mrkdwn: true,
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `Comment by ${commentOwner} on ${discussionOwner} discussion`
                }
            },
        ],
        attachments: [
            {
                "color": "#000000",
                "title": `Comment on #${eventPayload.discussion.number} ${eventPayload.discussion.title}`,
                "title_link": eventPayload.discussion.html_url,
                "text": eventPayload.comment.body,
            }
        ]
    }
}

function postPayload(eventPayload) {
    if (!!eventPayload.comment) {
        return postPayloadForComment(eventPayload)
    } else {
        return postPayloadForDiscussion(eventPayload)
    }
}

function postPayloadForComment(eventPayload) {
    switch (eventPayload.action) {
        case "created":
            return payloadForCommentCreated(eventPayload)
        case "edited":
        case "deleted":
        default:
            return null
    }
}

function postPayloadForDiscussion(eventPayload) {
    switch (eventPayload.action) {
        case "created":
            return payloadForDiscussionCreated(eventPayload)
        case "edited":
        case "deleted":
        case "pinned":
        case "unpinned":
        case "locked":
        case "unlocked":
        case "transferred":
        case "category_changed":
        case "answered":
        case "unanswered":
        case "labeled":
        case "unlabeled":
        default:
            return null
    }
}

async function verifySignature(event) {
    const headers = event.headers
    const body = event.body
    const token = await secretToken()
    const hmac = crypto.createHmac('sha256', token)
    hmac.update(body, 'utf8')
    const signature = `sha256=${hmac.digest('hex')}`
    return signature === headers['x-hub-signature-256']
}

function postMessage(payload, token) {
    const options = {
        hostname: "slack.com",
        port: 443,
        path: "/api/chat.postMessage",
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Bearer ${token}`,
        },
        maxAttempts: 5,
        retryDelay: 5000,
    };

    const req = https.request(options, (res) => {
        console.log(`statusCode: ${res.statusCode}`)
        res.on("data", (d) => {
            process.stdout.write(d)
        })
    })
    req.on("error", (error) => {
        console.error(error)
    });
    req.write(JSON.stringify(payload));
    req.end();

    return {statusCode: 200, body: 'OK'}
}

exports.handler = (event, context, callback) => {
    const eventPayload = getEventPayload(event)
    const payload = postPayload(eventPayload)

    if (! verifySignature(event)) {
        console.log("Signature is invalid")
        return {statusCode: 500, body: 'Signature is invalid'}
    }
    slackBotToken().then((data) => {
        postMessage(payload, data)
        callback(null)
    }).catch((e) =>{
        console.error(e)
        callback(e)
    })
};
