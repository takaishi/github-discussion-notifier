const crypto = require('crypto');
const AWS = require('aws-sdk');
const fetch = require("node-fetch");
const ssmClient = new AWS.SSM({apiVersion: '2014-11-06', region: 'ap-northeast-1'})

async function slackChannel() {
    if (process.env.SLACK_CHANNEL) {
        return process.env.SLACK_CHANNEL
    } else {
        params = {
            Name: process.env.SLACK_CHANNEL_PARAMETER_NAME,
            WithDecryption: false
        }
        const data = await ssmClient.getParameter(params).promise()
        return data.Parameter.Value
    }
}

const SLACK_CHANNEL = process.env.SLACK_CHANNEL

async function slackBotToken() {
    if (process.env.SLACK_BOT_TOKEN) {
        return process.env.SLACK_BOT_TOKEN
    } else {
        params = {
            Name: process.env.SLACK_BOT_TOKEN_PARAMETER_NAME,
            WithDecryption: false
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
            Name: process.env.SECRET_TOKEN_PARAMETER_NAME,
            WithDecryption: false
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


async function payloadForDiscussionCreated(eventPayload) {
    const channel = await slackChannel();
    const discussionOwner = `<${eventPayload.discussion.user.html_url}|${eventPayload.discussion.user.login}>`
    return {
        channel: channel,
        attachments: [
            {
                "color": "#008000",
                "pretext": `New discussion created by ${discussionOwner}`,
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

async function payloadForCommentCreated(eventPayload) {
    const channel = await slackChannel();
    const discussionOwner = `<${eventPayload.discussion.user.html_url}|${eventPayload.discussion.user.login}'s>`
    const commentOwner = `<${eventPayload.comment.user.html_url}|${eventPayload.comment.user.login}>`

    return {
        channel: channel,
        mrkdwn: true,
        attachments: [
            {
                "color": "#000000",
                "pretext": `New discussion created by ${discussionOwner}`,
                "title": `Comment on #${eventPayload.discussion.number} ${eventPayload.discussion.title}`,
                "title_link": eventPayload.discussion.html_url,
                "text": eventPayload.comment.body,
            }
        ]
    }
}

async function postPayload(eventPayload) {
    if (!!eventPayload.comment) {
        return await postPayloadForComment(eventPayload)
    } else {
        return await postPayloadForDiscussion(eventPayload)
    }
}

async function postPayloadForComment(eventPayload) {
    switch (eventPayload.action) {
        case "created":
            return await payloadForCommentCreated(eventPayload)
        case "edited":
        case "deleted":
        default:
            return null
    }
}

async function postPayloadForDiscussion(eventPayload) {
    switch (eventPayload.action) {
        case "created":
            return await payloadForDiscussionCreated(eventPayload)
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

async function postMessage(payload, token) {
    const options = {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Bearer ${token}`,

        }
    }
    await fetch('https://slack.com/api/chat.postMessage', options)

    return {statusCode: 200, body: 'OK'}
}

exports.handler = async (event, context, callback) => {
    const eventPayload = getEventPayload(event)
    const payload = await postPayload(eventPayload)
    const token = await slackBotToken()

    if (! verifySignature(event)) {
        console.error("Signature is invalid")
        return {statusCode: 500, body: 'Signature is invalid'}
    }

    try {
        await postMessage(payload, token)
    } catch(err) {
        console.error(err)
    }
};
