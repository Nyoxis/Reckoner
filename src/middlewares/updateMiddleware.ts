import type { MiddlewareFn, NarrowedContext, Context, Types, TelegramError } from 'telegraf'
import {
  buyRequisites,
  orderRequisites,
  payRequisites,
  giveRequisites,
  transactionCommand,
} from './operationsMiddlewares'

import type { Member, Record } from '@prisma/client'
import { findChat, withType, commandName, editErrorHandling } from '../constants/functions'
const getExecuteUpdate = (
  update: NarrowedContext<Context, Types.MountMap['edited_message']>,
  record: Record,
) => {
  return async (
    donor: Member | undefined,
    recipients: Member[],
    amount: number,
  ) => {
    const donorArg = donor ? { connect: { chatId_account: {chatId: donor.chatId, account: donor.account } } } : {}
    await update.prisma.record.deleteMany({
      where: {
        id: record.id,
        chatId: record.chatId,
      }
    })
    const transaction = await withType(update, await update.prisma.record.create({
      select: {
        id: true,
        messageId: true,
        replyId: true,
        chatId: true,
        donorAccount: true,
        hasDonor: true,
        recipientsQuantity: true,
        amount: true,
        active: true,
        recipients: {
          select: {
            account: true,
          }
        }
      },
      data: {
        id: record.id,
        chat: {
          connect: { id: record.chatId }
        },
        messageId: record.messageId,
        replyId: record.replyId,
        donor: donorArg,
        hasDonor: !!donor,
        recipients: {
          createMany: {
            data: recipients.map(recipient => ({ memberChatId: recipient.chatId, account: recipient.account }))
          }
        },
        recipientsQuantity: recipients.length,
        amount: Math.trunc(amount),
        active: true,
      }
    }))
    const text = commandName(transaction)
    editErrorHandling(async () => {
      await update.telegram.editMessageText(update.chat.id, Number(record.replyId), undefined, text)
    })
  }
}

const editedErrorHandling = async (
  update: NarrowedContext<Context, Types.MountMap['edited_message']>,
  reply_message_id: number,
  callback: () => void | Promise<void>,
) => {
  try {
    await callback()
  } catch (err) {
    if (typeof err === 'string') {
      const chatId = await findChat(update)
      await update.prisma.record.update({
        where: {
          chatId_messageId: {
            chatId,
            messageId: update.editedMessage.message_id
          }
        },
        data: {
          active: false
        }
      })
      editErrorHandling(async () => {
        if (typeof err === 'string') {
          await update.telegram.editMessageText(update.chat.id, reply_message_id, undefined, err)
        }
      })
    } else throw err
  }
}

const updateMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['edited_message']>> = async (update, next) => {
  if (!('text' in update.editedMessage)) return next()
  
  const id = update.editedMessage.message_id
  const chatId = await findChat(update)
  
  const record = await update.prisma.record.findUnique({
    where: {
      chatId_messageId: {
        messageId: id,
        chatId,
      }
    }
  })
  if (!record?.replyId) return next()
  const ctx = {
    message: update.editedMessage,
    chat: update.chat,
    prisma: update.prisma,
    cache: update.cache,
    telegram: update.telegram,
  }
  
  const text = ctx.message.text
  const words = text.split(' ')
  if (!(words.length > 1 && words[1].startsWith('/'))) return next()
  
  const command = words[1]
  switch (command) {
    case '/buy':
      editedErrorHandling(
        update,
        Number(record.replyId),
        await transactionCommand(ctx, buyRequisites, getExecuteUpdate(update, record))
      )
      break
    case '/order':
      editedErrorHandling(
        update,
        Number(record.replyId),
        await transactionCommand(ctx, orderRequisites, getExecuteUpdate(update, record), false)
      )
      break
    case '/pay':
      editedErrorHandling(
        update,
        Number(record.replyId),
        await transactionCommand(ctx, payRequisites, getExecuteUpdate(update, record))
      )
      break
    case '/give':
      editedErrorHandling(
        update,
        Number(record.replyId),
        await transactionCommand(ctx, giveRequisites, getExecuteUpdate(update, record))
      )
      break
    default:
      const reply_text = 'Новая команда операции не распознана, операция будет пропущена'
      await update.prisma.record.update({
        where: {
          chatId_id: {
            id: record.id,
            chatId: record.chatId,
          }
        },
        data: { active: false },
      })
      editErrorHandling(async () => {
        await update.telegram.editMessageText(update.chat.id, Number(record.replyId), undefined, reply_text)
      })
  }
}

export default updateMiddleware
