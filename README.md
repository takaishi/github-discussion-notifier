# GitHub Discussion Notifier

## How to deploy

## How to run function with dummy payload at localhost

Use AWS SAM. You need to install AWS SAM CLI, please read [Installing the AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html).

### Environment variables for SAM

Create `functions/github-discussion-notifier/env.json`.

```json
{
  "MainFunction": {
    "SLACK_BOT_TOKEN": "xoxb-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "SECRET_TOKEN": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "SLACK_CHANNEL": "XXXXXXXXXXXXXXX"
  }
}
```

### Run function at localhost

You can run function with event of creation discussion at localhost:

```
$ sam local generate-event apigateway http-api-proxy --body "$(cat ./webhook_discussion_created.json)" \
  | SAM_CLI_TELEMETRY=0 sam local invoke --env-vars env.json MainFunction --debug --event -
```

And you can run function with event of creation comment to discussion at localhost:

```
$ sam local generate-event apigateway http-api-proxy --body "$(cat ./webhook_discussion_comment_created.json)" \
  | SAM_CLI_TELEMETRY=0 sam local invoke --env-vars env.json MainFunction --debug --event -
```



## Lambda

Need to configure manually:

- Function URL

## GitHub webhook

Need to create webhook with following:

- Payload URL: Specify Function URL of Lambda.
- Secret: Specify same value saved in `PARAMETER_STORE_SECRET_TOKEN`.
- Events: Specify `Discussions` .