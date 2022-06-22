import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

import findAsync from '../constants/findAsync'

const sendMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const parameters = ctx.message.text.split(' ').slice(1)
  if (!parameters.length) {
    ctx.reply('a list of users', { reply_to_message_id: ctx.message.message_id })
  }
  
  try {
    //first parameter is a number
    if (Number.parseFloat(parameters[0]).toString() === parameters[0]) {
      const numeric = Number.parseFloat(parameters[0])
      const sum = Math.trunc(numeric * 100)
      
      const members = await ctx.prisma.member.findMany({
        where: {
          chatId: ctx.chat.id
        }
      })
      
      if (!parameters[1]) throw 'member name is expected'
      const addressee = await findAsync(members, async (member) => {
        if (ctx.prisma.computeKind(member).kind === 'USER') {
          const chatMember = await ctx.getChatMember(Number.parseInt(member.account))
          if (parameters[1].slice(1) === chatMember.user.username) return true
        } else if (parameters[1] === member.account) return true
      })
      
      if (!addressee) throw 'member is not found'
      const transaction = await ctx.prisma.record.create({
        data: {
          chat: {
            connect: { id: ctx.chat.id }
          },
          donor: {
            connect: {
              chatId_account: {
                chatId: ctx.chat.id,
                account: ctx.message.from.id.toString()
              }
            }
          },
          recipients: {
            create: {
              chatId: ctx.chat.id,
              account: addressee.account
            }
          },
          amount: sum,
        }
      })
      ctx.reply(transaction.amount.toString(), { reply_to_message_id: ctx.message.message_id })
    }
  } catch (err) {
    if (typeof err === 'string') {
      ctx.reply(err, { reply_to_message_id: ctx.message.message_id })
    } else throw err
  }
  

}

export default sendMiddleware
