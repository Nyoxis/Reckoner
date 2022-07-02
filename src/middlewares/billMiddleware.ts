import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

const billMIddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const members = ctx.prisma.computeKind(
    await ctx.prisma.member.findMany({
      where: { chatId: ctx.chat.id }
    })
  )
  
  const promises = members.map(async (member) => {
    let name: string
    if (member.kind === 'USER') {
      const fullUser = await ctx.getChatMember(Number.parseInt(member.account))
      name = fullUser.user.first_name
    } else name = member.account
    
    const donorInPromise = ctx.prisma.record.findMany({
      where: {
        chatId: member.chatId,
        donorAccount: member.account,
        active: true,
      }
    })
    const recepientInPromise = ctx.prisma.record.findMany({
      select: {
        amount: true,
        recipients: { select: { account: true }},
      },
      where: {
        chatId: member.chatId,
        recipients: { some: { account: member.account } },
        active: true,
      }
    })
    
    const [donorIn, recepientIn]  = await Promise.all([donorInPromise, recepientInPromise])
    const transactions = donorIn.map(record => record.amount).concat(recepientIn.map(record => -record.amount/record.recipients.length))
    const sum = transactions.reduce((sum, transaction) => sum + transaction, 0)
    
    return `${name} ${Math.trunc(sum/100)}.${('0' + sum%100).slice(-2)}`
  })
  
  const results = await Promise.all(promises)
  const replyText = results.join('\n')
  ctx.reply(replyText ? replyText : 'list is empty', { reply_to_message_id: ctx.message?.message_id })
}

export default billMIddleware
