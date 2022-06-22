import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

const billMIddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const members = await ctx.prisma.member.findMany({
    where: { chatId: ctx.chat.id }
  })
  const MembersName = members.map(async (member) => {
    let name: string
    if (ctx.prisma.computeKind(member).kind === 'USER') {
      const fullUser = await ctx.getChatMember(Number.parseInt(member.account))
      name = fullUser.user.first_name
    } else name = member.account
    
    const donorIn = ctx.prisma.record.findMany({
      where: {
        chatId: member.chatId,
        donorAccount: member.account,
      }
    })
    const recepientIn = ctx.prisma.record.findMany({
      where: {
        chatId: member.chatId,
        recipients: { some: {} }
      }
    })
    
    const sum = await Promise.all([donorIn, recepientIn]).then(result => {
      const [donorIn, recepientIn] = result

      const transactions = donorIn.map(record => record.amount).concat(recepientIn.map(record => -record.amount))
      return transactions.reduce((sum, transaction) => {
        return sum + transaction
      })
    })
    return `${name} ${Math.trunc(sum/100)}.${('0' + sum%100).slice(-2)}`
  })
  
  const replyText = await Promise.all(MembersName).then(results => {
    return results.join('\n')
  })
  ctx.reply(replyText ? replyText : 'list is empty', { reply_to_message_id: ctx.message?.message_id })
}

export default billMIddleware
