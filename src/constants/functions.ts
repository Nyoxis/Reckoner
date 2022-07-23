import mexp from 'math-expression-evaluator'
import { MemberWithLink } from './types'

import type { NarrowedContext, Context, Types, Markup, TelegramError } from 'telegraf'
import type { Message, User, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import type { PrismaChatContext, MemberWithUsername } from './types'
import type { MemberWithKind } from './accountKind'

export const errorHandling = async (
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

export const updateKeyboard = async (
  ctx: NarrowedContext<Context, Types.MountMap['callback_query']>,
  text: string,
  markup: Markup.Markup<InlineKeyboardMarkup>,
) => {
  if(!ctx.callbackQuery.message) return
  const message = ctx.callbackQuery.message
  if ('text' in message && message.text === text && message.reply_markup === markup.reply_markup) return
  try {
    await ctx.telegram.editMessageText(
      message.chat.id,
      message.message_id,
      undefined,
      text,
      { parse_mode: 'MarkdownV2', reply_markup: markup.reply_markup }
    )
  } catch(e) {
    const err = e as TelegramError
    if (err.code !== 400) throw e
  }
}

type MemberOrMembers<T extends MemberWithKind | MemberWithKind[]> = T extends MemberWithKind ? MemberWithLink : MemberWithLink[]
type WithLink = {
  <T extends MemberWithKind | MemberWithKind[]>(arg0: PrismaChatContext, arg1: T): Promise<MemberOrMembers<T>>
  (arg0: PrismaChatContext, arg1: MemberWithKind | MemberWithKind[]): Promise<MemberWithLink | MemberWithLink[]>
}
export const withLink: WithLink = async ( ctx: PrismaChatContext, members: MemberWithKind | MemberWithKind[] ) => {
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

export const getSimpleMember = (member: MemberWithUsername | undefined) => {
  return member ? { account: member.account, chatId: member.chatId, active: member.active } : undefined
}

export const listMembers = async (ctx: PrismaChatContext, active?: boolean): Promise<MemberWithLink[]> => {
  if (!ctx.chat) return []
  const cachedMembers: MemberWithLink[] | undefined = ctx.cache.get(ctx.chat.id)
  if (cachedMembers) return cachedMembers
  
  const members = ctx.prisma.withKind(
    await ctx.prisma.member.findMany({
      where: { chatId: ctx.chat.id, active }
    })
  )
  const membersWithLink = await withLink(ctx, members)
  ctx.cache.set(ctx.chat.id, membersWithLink)
  
  return membersWithLink
}

export const nameMemberCmp = (name: string, member: MemberWithLink) => {
  return member.getKind() === 'USER'
  ? member.username
      ? !name.slice(1).localeCompare(member.username, 'en', { sensitivity: 'base' })
      : !name.slice(1).localeCompare(member.account, 'en', { sensitivity: 'base' })
  : !name.localeCompare(member.account, 'ru', { sensitivity: 'base' })
}

export const resolveQuery = (members: MemberWithLink[], queryMembers: string[]) => {
  const missing = queryMembers.filter(query => !members.some(member => nameMemberCmp(query, member)))
  if (missing.length) throw `Участник${missing.length>1 ? 'и' : ''} ${missing.join(', ')} не найден${missing.length>1 ? 'ы' : ''}`
  
  const foundMembers = members.filter(member => queryMembers.some(query => nameMemberCmp(query, member)))
  return foundMembers
}

export const evaluate = (s: string) => {
  try {
    return Number.parseFloat(mexp.eval(s))
  } catch (e) {
    const error = e as Error
    throw error.message
  }
}

export const replaceMentions = (message: Pick<Message.TextMessage, 'entities' | 'text'>, parameters: string[]) => {
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

export const sneakyAddId = async (ctx: PrismaChatContext, from: User) => {
  if (!from.username) return
  const username = from.username
  const members = await listMembers(ctx)
  const thatMember = members.find((member) => {
      return !member.account.slice(1).localeCompare(username, 'en', { sensitivity: 'base' })
    })
  
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
  ctx.cache.del(Number(thatMember.chatId))
}

