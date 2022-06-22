import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

const orderMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const parameters = ctx.message.text.split(' ').slice(1)
  if (!parameters.length) {
    ctx.reply('a list of users', { reply_to_message_id: ctx.message.message_id })
  }
  
  //first parameter is a number
  if (Number.parseFloat(parameters[0]).toString() === parameters[0]) {
    const numeric = Number.parseFloat(parameters[0])
    const sum = Math.trunc(numeric * 100)
    
    const members = await ctx.prisma.member.findMany({
      where: {
        chatId: ctx.chat.id
      }
    })
    
    const transaction = await ctx.prisma.record.create({
      data: {
        chat: {
          connect: { id: ctx.chat.id }
        },
        recipients: {
          createMany: {
            data: members
          }
        },
        amount: sum,
      }
    })
    
    ctx.reply(transaction.amount.toString(), { reply_to_message_id: ctx.message.message_id })
  }
}

export default orderMiddleware
