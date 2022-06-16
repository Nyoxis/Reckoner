import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'

const includeMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  let names = ctx.message.text.split(' ').slice(1)
  let myself = false
  
  if (Array.length === 0) myself = true
  names = names.filter((name) => {
    if (name === 'me') {
      myself = true
      return false
    } else return true
  })
  
  let memberList: string[] = []
  
  for (const name of names) {
    if (Number.parseInt(name).toString() === name) {
      return ctx.reply('names with only digits are not allowed', { reply_to_message_id: ctx.message?.message_id })
    }
    const member = await ctx.prisma.member.create({
      data: {
        chat: { connect: { id: ctx.chat.id }},
        account: name
      }
    })
    if (member) {
      memberList.push(member.account)
    } else return ctx.reply('error with DB', { reply_to_message_id: ctx.message?.message_id })
  }
  
  if (myself) {
    const member = await ctx.prisma.member.create({
      data: {
        chat: { connect: { id: ctx.chat.id } },
        account: ctx.message.from.id.toString()
      }
    })
    
    if (member) {
      const memberItem = await ctx.getChatMember(Number.parseInt(member.account))
      memberList.push(memberItem.user.first_name)
    } else return ctx.reply('error with DB', { reply_to_message_id: ctx.message?.message_id })
  }
  
  ctx.reply(JSON.stringify(memberList), { reply_to_message_id: ctx.message?.message_id })
}

export default includeMiddleware