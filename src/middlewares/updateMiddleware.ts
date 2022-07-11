import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import {
  buyRequisites,
  orderRequisites,
  payRequisites,
  giveRequisites,
  transactionCommand,
} from './operationsMiddlewares'

import type { Member, Record } from '@prisma/client'
const getExecuteUpdate = (
  update: NarrowedContext<Context, Types.MountMap['edited_message']>,
  record: Record,
) => {
  return async (
    donor: Member | undefined,
    recipients: Member[],
    amount: number,
  ) => {
    const donorArg = donor ? { connect: { chatId_account: donor } } : {}
    const recipientsUpdate = recipients.map((recipient) => ({
      where: {
        chatId_account_recordId: {
          chatId: update.chat.id,
          account: recipient.account,
          recordId: record.id,
        }
      },
      data: recipient,
    }))
    const transaction = await update.prisma.record.update({
      where: {
        id: record.id,
      },
      data: {
        chat: {
          connect: { id: update.chat.id }
        },
        message_id: record.message_id,
        donor: donorArg,
        recipients: {
          update: recipientsUpdate,
        },
        amount: Math.trunc(amount),
        active: true,
      }
    })
    const text = transaction.amount.toString()
    if (('text' in update.editedMessage) && text !== update.editedMessage.text) {
      update.telegram.editMessageText(update.chat.id, Number(record.reply_id), undefined, text)
    }
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
      if (('text' in update.editedMessage) && err !== update.editedMessage.text) {
        update.telegram.editMessageText(update.chat.id, reply_message_id, undefined, err)
      }
    } else throw err
  }
}

const updateMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['edited_message']>> = async (update, next) => {
  if (!('text' in update.editedMessage)) return next()
  
  const id = update.editedMessage.message_id
  const chat = update.editedMessage.chat
  
  const record = await update.prisma.record.findUnique({
    where: {
      message_id_chatId: {
        message_id: id,
        chatId: chat.id,
      }
    }
  })
  if (!record?.reply_id) return next()
  const ctx = {
    message: update.editedMessage,
    chat: update.chat,
    prisma: update.prisma,
    cache: update.cache,
    telegram: update.telegram,
  }
  
  const text = update.editedMessage.text
  const command = text.split(' ')[0]
  switch (command) {
    case '/buy':
      editedErrorHandling(
        update,
        Number(record.reply_id),
        await transactionCommand(ctx, buyRequisites, getExecuteUpdate(update, record))
      )
      break
    case '/order':
      editedErrorHandling(
        update,
        Number(record.reply_id),
        await transactionCommand(ctx, orderRequisites, getExecuteUpdate(update, record), false)
      )
      break
    case '/pay':
      editedErrorHandling(
        update,
        Number(record.reply_id),
        await transactionCommand(ctx, payRequisites, getExecuteUpdate(update, record))
      )
      break
    case '/give':
      editedErrorHandling(
        update,
        Number(record.reply_id),
        await transactionCommand(ctx, giveRequisites, getExecuteUpdate(update, record))
      )
      break
    default:
      const reply_text = 'only transactional commands are supported, previous transaction will be omited'
      await update.prisma.record.update({
        where: { id: record.id },
        data: { active: false },
      })
      if (reply_text !== update.editedMessage.text) {
        update.telegram.editMessageText(update.chat.id, Number(record.reply_id), undefined, reply_text)
      }
  }
}

export default updateMiddleware
