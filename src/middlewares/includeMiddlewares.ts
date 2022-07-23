
import { numericFilter, usernameFilter, alphabeticalFilter, escapeChars } from '../constants'
import { errorHandling, listMembers, replaceMentions, nameMemberCmp, resolveQuery, withLink } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { MemberWithLink, MemberWithUsername } from '../constants/types'
import type { Member } from '@prisma/client'
import { MemberWithKind } from '../constants/accountKind'



const includeMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = [...new Set(names)]
  names = replaceMentions(ctx.message, names)
  
  errorHandling(ctx, async () => {
    let reply: string = ''
    const existedMembers = await listMembers(ctx)

    let forReplace: {
      name: string,
      member: MemberWithLink,
    }[] = []
    let missingSubs: string[] = []
    names = names.map(name => {
      const substitutes = name.split('*')
      if (substitutes.length > 2) throw 'Ожидается одна звездочка между двумя именами'
      if (substitutes.length < 2) return name
      const replacable = existedMembers.find(member => nameMemberCmp(substitutes[0], member))
      if (replacable) forReplace.push({ name: substitutes[1], member: replacable })
        else missingSubs.push(substitutes[0])
      return substitutes[1]
    })
    
    if(missingSubs.length) {
      const m = missingSubs.length > 1
      reply = reply + `Им${m ? 'ена' : 'я'} *` +
                      missingSubs.map(escapeChars).join(', ') +
                      `* не найден${m ? 'ы' : ''} в списке участников и не ${m ? 'могут' : 'может'} быть заменен${m ? 'ы' : ''}\\.\n`
    }
    names = names.filter(name => !missingSubs.some(sub => sub === name))
    
    if (names.some(name => !name.startsWith('@') && !alphabeticalFilter.test(name))) {
      throw 'Допустимые символы имени 0-9 а-я a-z, нижнее подчеркивание и точка, не менее 3 символов'
    }
    if (names.some(name => numericFilter.test(name))) throw 'Имена состоящие только из цифр не допускаются'
    if (names.some(name => name.startsWith('@') && !usernameFilter.test(name))) throw 'Имя пользователя введено неверно'
    
    const alreadyOccupied = existedMembers.filter(member => names.some(name => nameMemberCmp(name, member)))
    names = names.filter(name => !alreadyOccupied.some(member => nameMemberCmp(name, member)))
    
    if (alreadyOccupied.length) {
      const m = alreadyOccupied.length > 1
      reply = reply + `Участник${m ? 'и' : ''} *` +
      alreadyOccupied.map(member => member.linkName()).join(', ') +
      `* ранее был${m ? 'и' : ''} добавлен${m ? 'ы' : ''}\\.\n`
    }
    
    const includedListPromises = names.map(async (name) => {
      const account = /^@[0-9]+$/.test(name) ? name.slice(1) : name
      
      const sub = forReplace.find(sub => sub.name === name)
      let member: MemberWithKind
      if (sub) {
        member = ctx.prisma.withKind(await ctx.prisma.member.update({
          where: {
            chatId_account: {
              chatId: sub.member?.chatId,
              account: sub.member?.account,
            }
          },
          data: {
            chat: { connect: { id: ctx.chat.id }},
            account,
          }
        }))
      } else {
        member = ctx.prisma.withKind(await ctx.prisma.member.create({
          data: {
            chat: { connect: { id: ctx.chat.id }},
            account,
          }
        }))
      }
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

const manageMembersCommand: manageFnType = async (ctx, onCompleteWord, onActive, memberUpdate) => {
  let names: string[]
  names = ctx.message.text.split(' ').slice(1)
  names = replaceMentions(ctx.message, names)
  
  const members = await listMembers(ctx, onActive)
  const managing = resolveQuery(members, names)
  const managedPromise = managing.map(memberUpdate)
  const managed = await Promise.all(managedPromise)
  ctx.cache.del(ctx.chat.id)
  
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

export { includeMiddleware, excludeMiddleware, freezeMiddleware, unfreezeMiddleware }
