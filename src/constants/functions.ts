import mexp from 'math-expression-evaluator'
import { MemberWithLink } from './types'

import type { NarrowedContext, Context, Types } from 'telegraf'
import type { Message, User } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext } from './types'
import type { MemberWithKind } from './accountKind'

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

type MemberOrMembers<T extends MemberWithKind | MemberWithKind[]> = T extends MemberWithKind ? MemberWithLink : MemberWithLink[]
type WithLink = {
  <T extends MemberWithKind | MemberWithKind[]>(arg0: PrismaChatContext, arg1: T): Promise<MemberOrMembers<T>>
  (arg0: PrismaChatContext, arg1: MemberWithKind | MemberWithKind[]): Promise<MemberWithLink | MemberWithLink[]>
}
const withLink: WithLink = async ( ctx: PrismaChatContext, members: MemberWithKind | MemberWithKind[] ) => {
  const getLink = async (member: MemberWithKind): Promise<MemberWithLink> => {
    let name: string = ''
    let username: string | undefined = undefined
    if (member.getKind() === 'USER') {
      if (!ctx.chat) throw new Error('chat is undefined')
      const fullUser = await ctx.telegram.getChatMember(ctx.chat.id, Number.parseInt(member.account))
      name = fullUser.user.first_name
      username = fullUser.user.username
    } else name = member.account
    
    const memberWithUsername = {
      ...member,
      name,
      username,
    }
    return new MemberWithLink(memberWithUsername)
  }
  
  if (Array.isArray(members)) {
    return await Promise.all(members.map(getLink))
  } else return await getLink(members)
}

const listMembers = async (ctx: PrismaChatContext, active?: boolean): Promise<MemberWithLink[]> => {
  if (!ctx.chat) return []
  const members = ctx.prisma.withKind(
    await ctx.prisma.member.findMany({
      where: { chatId: ctx.chat.id, active }
    })
  )
  
  return await withLink(ctx, members)
}

const resolveQuery = (members: MemberWithLink[], queryMembers: string[]) => {
  const missing = queryMembers.filter(query => {
    return !members.some(member => (member.getKind() === 'USER' && member.username)
      ? member.username === query.slice(1)
      : (query.startsWith('@') && !member.account.startsWith('@'))
          ? member.account === query.slice(1)
          : member.account === query
    )
  })
  if (missing.length) throw `Участник${missing.length>1 ? 'и' : ''} ${missing.join(', ')} не найден${missing.length>1 ? 'ы' : ''}`
  
  const foundMembers = members.filter(member => (member.getKind() === 'USER' && member.username)
      ? queryMembers.some(query => (query.slice(1) === member.username))
      : queryMembers.some(query => {
        return (query.startsWith('@') && !member.account.startsWith('@'))
          ? query.slice(1) === member.account
          : query === member.account
      })
  )
  return foundMembers
}

const evaluate = (s: string) => {
  try {
    return Number.parseFloat(mexp.eval(s))
  } catch (e) {
    const error = e as Error
    throw error.message
  }
}

const replaceMentions = (message: Pick<Message.TextMessage, 'entities' | 'text'>, parameters: string[]) => {
  //replace mention parameters with id
  if (!message.entities) return parameters
  message.entities.forEach((entity) => {
    if (entity.type !== 'text_mention') return
    const mention_text = message.text.slice(entity.offset, entity.offset + entity.length)
    const index = parameters.findIndex((parameter) => parameter === mention_text)
    return parameters[index] = '@' + entity.user.id.toString() //@ is a fix to distinct the sum
  })
  return parameters
}

const sneakyAddId = async (ctx: PrismaChatContext, from: User) => {
  if (!from.username) return
  const members = await listMembers(ctx)
  const thatMember = members.find((member) => member.account.slice(1) === from.username)
  
  if (!thatMember) return
  await ctx.prisma.member.update({
    where: {
      chatId_account: {
        chatId: thatMember.chatId,
        account: thatMember.account,
      }
    },
    data: {
      account: from.id.toString()
    }
  })
}

export { errorHandling, listMembers, resolveQuery, evaluate, replaceMentions, withLink, sneakyAddId }
