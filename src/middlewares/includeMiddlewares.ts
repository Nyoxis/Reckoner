
import { numericFilter, usernameFilter, alphabeticalFilter, escapeChars } from '../constants'
import { errorHandling, findChat, listMembers, replaceMentions, truncId, nameMemberCmp, resolveQuery, withLink } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { MemberWithLink, MemberWithUsername } from '../constants/types'
import type { Member } from '@prisma/client'
import { MemberWithKind } from '../constants/accountKind'
import { billMessageUpdate } from '../constants/billUpdateFunctions'

type NamesOrName<T extends string | string[]> = T extends string ? string | undefined : string[]
type FilteredNames = {
  <T extends string | string[]>(
    arg0: NarrowedContext<Context, Types.MountMap['text']>,
    arg1: T,
  ): Promise<{
    filteredNames: NamesOrName<T>
    missingText: string
  }>
  <T extends string | string[]>(
    arg0: NarrowedContext<Context, Types.MountMap['text']>,
    arg1: T,
  ): Promise<{
    filteredNames: string | string[] | undefined
    missingText: string
  }>
}
const filterInputNames: FilteredNames = async (ctx, namesOrName) => {
  let names: string[]
  if (!Array.isArray(namesOrName)) names = [namesOrName]
    else names = namesOrName
  
  if (names.some(name => !name.startsWith('@') && !alphabeticalFilter.test(name))) {
    throw 'Допустимые символы имени 0-9 а-я a-z, нижнее подчеркивание и точка, не менее 3 символов'
  }
  if (names.some(name => numericFilter.test(name))) throw 'Имена состоящие только из цифр не допускаются'
  if (names.some(name => name.startsWith('@') && !usernameFilter.test(name))) throw 'Имя пользователя введено неверно'
  
  const existedMembers = await listMembers(ctx)
  const alreadyOccupied = existedMembers.filter(member => names.some(name => nameMemberCmp(name, member)))
  const filteredNames = names.filter(name => !alreadyOccupied.some(member => nameMemberCmp(name, member)))
  
  let missingText: string = ''
  if (alreadyOccupied.length) {
    const m = alreadyOccupied.length > 1
    missingText = `Участник${m ? 'и' : ''} *` +
    alreadyOccupied.map(member => member.linkName()).join(', ') +
    `* ранее был${m ? 'и' : ''} добавлен${m ? 'ы' : ''}\\.\n`
  }
  
  if (!Array.isArray(namesOrName)) return { filteredNames: filteredNames[0], missingText }
    else return { filteredNames, missingText }
}

const renameMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = [...new Set(names)]
  names = replaceMentions(ctx.message, names)
  
  errorHandling(ctx, async () => {
    let reply: string = ''
    
    if (names.length !== 2) throw 'Введите имя участника и новое имя'
    const oldname = names[0]
    const newname = names[1]
    
    const existedMembers = await listMembers(ctx)
    const renaming = existedMembers.find(member => nameMemberCmp(oldname, member))
    if (!renaming) throw `Участник ${oldname} не найден`
    
    const { filteredNames, missingText } = await filterInputNames(ctx, newname)
    reply = reply + missingText
    
    let renamed: MemberWithLink
    if (filteredNames) {
      const account = truncId(filteredNames)
      renamed = await withLink(ctx, ctx.prisma.withKind(await ctx.prisma.member.update({
        where: {
          chatId_account: {
            chatId: renaming.chatId,
            account: renaming.account,
          }
        },
        data: {
          chat: { connect: { id: renaming.chatId }},
          account,
        }
      })))
      ctx.cache.del(Number(renaming.chatId))
      await billMessageUpdate(ctx)

      reply = reply + `Имя участника *${renaming.linkName()}* заменено на *${renamed.linkName()}*`
    } else reply = reply + 'Имя не изменено'
    
    ctx.reply(reply, { reply_to_message_id: ctx.message?.message_id, parse_mode: 'MarkdownV2' })
  })
}

const includeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = [...new Set(names)]
  names = replaceMentions(ctx.message, names)
  
  errorHandling(ctx, async () => {
    let reply: string = ''
    
    const chatId = await findChat(ctx)

    const { filteredNames, missingText } = await filterInputNames(ctx, names)
    reply = reply + missingText
    
    const includedListPromises = filteredNames.map(async (name) => {
      const account = truncId(name)
      let member: MemberWithKind
      

      
      member = ctx.prisma.withKind(await ctx.prisma.member.create({
        data: {
          chat: { connect: { id: chatId }},
          account,
        }
      }))
      
      return await withLink(ctx, member)
    })
    const includedList = await Promise.all(includedListPromises)
    ctx.cache.del(Number(chatId))
    await billMessageUpdate(ctx)
    
    const m = includedList.length > 1
    reply = includedList.length
      ? reply + `Добавлен${m ? 'ы' : ''} участник${m ? 'и' : ''} *` +
                 includedList.map(member => member.linkName()).join(', ') + `*`
      : reply + 'Никто не добавлен'
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

const manageMembersCommand: manageFnType = async (ctx, onCompleteWord, onActive, memberUpdate) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = replaceMentions(ctx.message, names)
  
  const members = await listMembers(ctx, onActive)
  const managing = resolveQuery(members, names)
  const managedPromise = managing.map(memberUpdate)
  const managed = await Promise.all(managedPromise)
  if (managed.length) ctx.cache.del(Number(managed[0].chatId))
  await billMessageUpdate(ctx)
  
  if (managing.length !== managed.length) throw new Error('error while deleting member')
  const m = managing.length > 1
  const text = `Участник${m ? 'и' : ''} ${managing.map(member => member.linkName()).join(', ')} ${onCompleteWord}${m ? 'ы' : ''}`
  ctx.reply(text, { reply_to_message_id: ctx.message.message_id, parse_mode: 'MarkdownV2' })
}

const excludeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  manageMembersCommand(ctx, 'исключен', undefined, (member) => ctx.prisma.member.delete({
    where: {
      chatId_account: {
        chatId: member.chatId,
        account: member.account,
      }
    }
  }))
}

const freezeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  manageMembersCommand(ctx, 'заморожен', true, (member) => ctx.prisma.member.update({
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
  manageMembersCommand(ctx, 'разморожен', false, (member) => ctx.prisma.member.update({
    where: {
      chatId_account: {
        chatId: member.chatId,
        account: member.account,
      }
    },
    data: { active: true }
  }))
}

export { renameMiddleware, includeMiddleware, excludeMiddleware, freezeMiddleware, unfreezeMiddleware }
