import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

const billMIddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const members = await ctx.prisma.member.findMany({
    where: { chatId: ctx.chat.id }
  })
  const MembersName = members.map(async (member) => {
    if (ctx.prisma.computeKind(member).kind === 'USER') {
      const fullUser = await ctx.getChatMember(Number.parseInt(member.account))
      return fullUser.user.first_name
    } else {
      return member.account
    }
  })
  
  const replyText = await Promise.all(MembersName).then(function(results) {
    return results.join('\n')
  })
  ctx.reply(replyText ? replyText : 'list is empty', { reply_to_message_id: ctx.message?.message_id })
}

export default billMIddleware
