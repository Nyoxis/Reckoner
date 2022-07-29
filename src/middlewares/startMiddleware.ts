import { errorHandling } from '../constants/functions'

import { Markup, TelegramError } from 'telegraf'
import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { Chat } from '@prisma/client'
import { ReplyKeyboardMarkup, ReplyKeyboardRemove } from 'telegraf/typings/core/types/typegram'

const startMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, async () => {
    let replyMessages: String[] = []
    let config = ctx.message.text.split(' ')[1]
    
    if (ctx.chat.type === 'private' && config === 'protected') {
      replyMessages.push('Защищенный режим бота недоступен в личной переписке')
      config = 'public'
    }
    
    const buttons = [[
      Markup.button.text('/bill'),
      Markup.button.text('/undo'),
      Markup.button.text('/redo'),
    ]]
    let markup: Markup.Markup<ReplyKeyboardMarkup | ReplyKeyboardRemove> = Markup.keyboard(buttons).resize(true)
    
    let chat: Chat
    switch (config) {
      case 'protected':
        const thisChat = await ctx.getChat()
        
        if (thisChat.type !== 'private') {
          const admins = await ctx.getChatAdministrators()
          if (!admins.find(admin => admin.user.id === ctx.message.from.id)) {
            throw 'Только администратор группы может запустить бота в приватном режиме'
          }
          
          await ctx.telegram.sendMessage(
            ctx.message.from.id,
            `Привет, вы запустили этого бота в группе: ${thisChat.title}\n` +
            `Команды здесь будут отражены на участниках группы\n` +
            `Чтобы использовать бота в частном режиме используйте команду /start\n\n` +
            `Удерживайте /include и введите участников через пробел\n` +
            `Используйте /bill чтобы показать список дебета, долга`,
            { reply_markup: markup.reply_markup },
          ).catch((err: TelegramError) => {
            if (err.response.error_code === 403) {
              throw 'Бот заблокирован пользователем, использование в приватном режиме невозможно'
            } else throw err
          })
        }
        
        chat = await ctx.prisma.chat.upsert({
          where: { id: ctx.chat.id },
          update: { config: 'PROTECTED' },
          create: { id: ctx.chat.id, config: 'PROTECTED' }
        })
        chat?.config === 'PROTECTED'
          ? replyMessages.push(`Бот запущен в защищенном режиме, только администраторы могут вносить изменения`) 
          : replyMessages.push('Не удалось запустить бота. База данных недоступна')
        markup = Markup.removeKeyboard()
        await ctx.prisma.chat.upsert({
          where: { id: ctx.message.from.id },
          update: {
            groupChat: {
              connect: {
                id: ctx.chat.id
              }
            }
          },
          create: {
            id: ctx.message.from.id,
            groupChat: {
              connect: {
                id: ctx.chat.id
              }
            },
          },
        })
        ctx.telegram.deleteMyCommands({
          scope: {
            type: 'chat',
            chat_id: ctx.chat.id
          }
        })
        break
      
      case 'public':
      case '':
      case undefined:
        chat = await ctx.prisma.chat.upsert({
          where: { id: ctx.chat.id },
          update: { config: 'PUBLIC', groupChat: { disconnect: true }, privateChat: { disconnect: true }},
          create: { id: ctx.chat.id, config: 'PUBLIC' }
        })
        chat?.config === 'PUBLIC'
          ? ctx.chat.type !== 'private'
            ? replyMessages.push(
              'Бот запущен в публичном режиме, все участники группы могут вносить изменения\n' +
              'Удерживайте /include и введите участников через пробел\n' +
              'Используйте /bill чтобы показать список дебета, долга'
            )
            : replyMessages.push(
              'Бот запущен\nУдерживайте /include и введите участников через пробел\n' +
              'Используйте /bill чтобы показать список дебета, долга'
            )
          : replyMessages.push('Не удалось запустить бота. База данных недоступна')
        break
      
      default:
        replyMessages.push('unknow config')
    }
    
    ctx.reply(replyMessages.join('\n'), {reply_markup: markup.reply_markup, reply_to_message_id: ctx.message?.message_id })
  })
}

export default startMiddleware
