import { MemberWithUsername } from './../constants/types';
import config from '../config'
import { numericFilter, usernameFilter, alphabeticalFilter } from '../constants'
import { errorHandling, listMembers, replaceMentions, resolveQuery, withLink } from '../constants/functions'

import type { Member } from '@prisma/client'
import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'

const includeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = [...new Set(names)]
  names = replaceMentions(ctx.message, names)
  
  errorHandling(ctx, async () => {
    let reply: string = ''
    if (names.some(name => !name.startsWith('@') && !alphabeticalFilter.test(name))) {
      throw 'Допустимые символы имени 0-9 а-я a-z и нижнее подчеркивание, не менее 3 символов'
    }
    if (names.some(name => numericFilter.test(name))) throw 'Имена состоящие только из цифр не допускаются'
    if (names.some(name => name.startsWith('@') && !usernameFilter.test(name))) throw 'Имя пользователя введено неверно'
    
    const existedMembers = await listMembers(ctx)
    const alreadyOccupied = existedMembers.filter((member) => {
      return (member.getKind() === 'USER')
        ? names.find(name => member.username
            ? name.slice(1) === member.username
            : name.slice(1) === member.account
          )
        : names.find(name => name === member.account)
    })
    names = names.filter((name) => !alreadyOccupied.some(member => {
      return (member.getKind() === 'USER')
        ? member.username
          ? member.username === name.slice(1)
          : member.account === name.slice(1)
        : member.account === name
    }))
    
    if (alreadyOccupied.length) {
      reply = reply + `Участники *` +
      alreadyOccupied.map(member => member.linkName()).join(', ') +
      `* ранее были добавлены\\.\n`
    }
    
    const includedListPromises = names.map(async (name) => {
      const account = /^@[0-9]+$/.test(name) ? name.slice(1) : name
      const member = ctx.prisma.withKind(await ctx.prisma.member.create({
        data: {
          chat: { connect: { id: ctx.chat.id }},
          account,
        }
      }))
      return await withLink(ctx, member)
    })
    const includedList = await Promise.all(includedListPromises)
    ctx.cache.del(ctx.chat.id)
    
    const m = includedList.length > 1
    reply = includedList.length ? reply + `Добавлен${m ? 'ы' : ''} участник${m ? 'и' : ''} *${includedList.map(member => member.linkName()).join(', ')}*` : reply + 'Никто не добавлен'
    ctx.reply(reply, { reply_to_message_id: ctx.message?.message_id, parse_mode: 'MarkdownV2' })
  })
}

type memberUpdateType = (
  arg0: MemberWithUsername
) => Promise<Member>
type manageFnType = (
  arg0: NarrowedContext<Context, Types.MountMap['text']>,
  arg1: string,
  arg2: boolean | undefined,
  arg3: memberUpdateType
) => void
const manageMembers: manageFnType = async (ctx, onCompleteWord, onActive, memberUpdate) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = replaceMentions(ctx.message, names)
  
  errorHandling(ctx, async () => {
    const members = await listMembers(ctx, onActive)
    const removal = resolveQuery(members, names)
    const removedPromise = removal.map(memberUpdate)
    const removed = await Promise.all(removedPromise)
    ctx.cache.del(ctx.chat.id)
    
    if (removal.length !== removed.length) throw new Error('error while deleting member')
    const m = removal.length > 1
    const text = `Участник${m ? 'и' : ''} ${removal.map(member => member.linkName()).join(', ')} ${onCompleteWord}${m ? 'ы' : ''}`
    ctx.reply(text, { reply_to_message_id: ctx.message.message_id, parse_mode: 'MarkdownV2' })
  })
}

const excludeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  manageMembers(ctx, 'исключен', undefined, (member) => ctx.prisma.member.delete({
    where: {
      chatId_account: {
        chatId: member.chatId,
        account: member.account,
      }
    }
  }))
}

const freezeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  manageMembers(ctx, 'заморожен', true, (member) => ctx.prisma.member.update({
    where: {
      chatId_account: {
        chatId: member.chatId,
        account: member.account,
      }
    },
    data: { active: false }
  }))
}

const unfreezeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  manageMembers(ctx, 'разморожен', false, (member) => ctx.prisma.member.update({
    where: {
      chatId_account: {
        chatId: member.chatId,
        account: member.account,
      }
    },
    data: { active: true }
  }))
}

export { includeMiddleware, excludeMiddleware, freezeMiddleware, unfreezeMiddleware }
