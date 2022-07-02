import type { NarrowedContext, Context, Types } from 'telegraf'

const errorHandling = async (
  ctx: NarrowedContext<Context, Types.MountMap['text']>,
  callback: () => void | Promise<void>,
) => {
  try {
    await callback()
  } catch (err) {
    if (typeof err === 'string') {
      ctx.reply(err, { reply_to_message_id: ctx.message.message_id })
    } else throw err
  }
}

export { errorHandling }
