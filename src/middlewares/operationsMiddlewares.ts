import {
  errorHandling,
  getSimpleMember,
  listMembers,
  withType,
  commandName,
  evaluate,
  replaceMentions,
  resolveQuery,
  findChat,
} from '../constants/functions'
import { numericSymbolicFilter } from '../constants'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { Member, Record } from '@prisma/client'
import type { MemberWithUsername, SpecificContext } from '../constants/types'
import { billMessageUpdate } from '../constants/billUpdateFunctions'

const getExecuteTransaction = (
  ctx: NarrowedContext<Context, Types.MountMap['text']>,
) => {
  return async (
    donor: Member | undefined,
    recipients: Member[],
    amount: number,
  ) => {
    const chatId = await findChat(ctx)
    const lastActive = await ctx.prisma.record.findFirst({
      select: {
        id: true,
        chatId: true,
      },
      orderBy: {
        id: 'desc'
      },
      where: {
        chatId,
        active: true,
      },
    })

    const recordId = lastActive? lastActive.id + 1n : 1
    const donorArg = donor ? { connect: { chatId_account: { chatId: donor.chatId, account: donor.account } } } : {}
    
    await ctx.prisma.record.deleteMany({
      where: {
        id: recordId,
        chatId,
      }
    })
    const transaction = await withType(ctx, await ctx.prisma.record.create({
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
        id: recordId,
        chat: {
          connect: { id: chatId }
        },
        messageId: ctx.message.message_id,
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
    await billMessageUpdate(ctx)
    
    const reply = await ctx.reply(commandName(transaction), { reply_to_message_id: ctx.message.message_id })
    await ctx.prisma.record.update({
      where: {
        chatId_id: {
          id: transaction.id,
          chatId: transaction.chatId,
        }
      },
      data: {
        replyId: reply.message_id
      }
    })
  }
}

type requisitesCallback = (
  members: MemberWithUsername[],
  donor: MemberWithUsername | undefined,
  addressees: MemberWithUsername[],
) => MemberWithUsername[] | Promise<MemberWithUsername[]>

type transactionCallback = (
  donor: Member | undefined,
  recipients: Member[],
  amount: number,
) => void

const transactionCommand = async (
  ctx: SpecificContext,
  getTransactionRequisites: requisitesCallback,
  execute: transactionCallback,
  isSubjective: boolean = true,
) => {
  let parameters: string[]
  if (ctx.message.text.startsWith('/')) {
    parameters = [''].concat(ctx.message.text.split(' ').slice(1))
  } else {
    parameters = ctx.message.text.split(' ').splice(0, 1).concat(ctx.message.text.split(' ').slice(2))
  }

  /*if (!parameters.length) {
    ctx.reply('a list of users', { reply_to_message_id: ctx.message.message_id })
  }*/
  parameters = replaceMentions(ctx.message, parameters)
  const members = await listMembers(ctx, true)
  
  return async () => {
    let donor: MemberWithUsername | undefined
    if (!parameters[0]) {
      if (isSubjective) {
        donor = members.find(member => member.account === ctx.message.from.id.toString())
        if (!donor) throw 'Вы не являетесь участником'
      } else donor = undefined
    } else {
      if (!isSubjective) throw 'Операция не требует принципала'
      donor = resolveQuery(members, [parameters[0]])[0]
      if (!donor) throw 'Принципал не найден'
    }
    parameters = parameters.slice(1)
    
    let numeric: number | undefined
    let addresseeNames: string[] = []
    for (const parameter of parameters) {
      if (numericSymbolicFilter.test(parameter)) {
        numeric = evaluate(parameter)
        break
      }
      addresseeNames.push(parameter)
    }
    if (!numeric) throw 'Сумма отсутствует или использует недоступные символы'
    const sum = Math.trunc(numeric * 100)
    
    const addressees = resolveQuery(members, addresseeNames)
    
    const recipients = await getTransactionRequisites(members, donor, addressees)
    const simpleDonor: Member | undefined = getSimpleMember(donor)
    const isDefined = (member: Member | undefined): member is Member => !!member
    const simpleRecipients: Member[] = recipients.map(getSimpleMember).filter(isDefined)
    execute(simpleDonor, simpleRecipients, sum)
  }
}

const buyRequisites: requisitesCallback = (members, donor, addressees) => {
  let recipients
  if (!addressees.length) {
    recipients = members.filter(member => member !== donor)
  } else recipients = addressees
  if (recipients.some(addressee => addressee === donor)) throw 'Принипал не может быть адресатом'
  if (donor) recipients.push(donor)
  return recipients
}
const buyMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, buyRequisites, getExecuteTransaction(ctx)))
}

const orderRequisites: requisitesCallback = (members, donor, addressees) => {
  let recipients
  if (!addressees.length) {
    recipients = members.filter(member => member !== donor)
  } else recipients = addressees
  return recipients
}
const orderMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, orderRequisites, getExecuteTransaction(ctx), false))
}

const payRequisites: requisitesCallback = (members, donor, addressees) => {
  if (addressees.length) throw 'Операция не требует адресатов'
  const recipients: MemberWithUsername[] = []
  return recipients
}
const payMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, payRequisites, getExecuteTransaction(ctx)))
}

const giveRequisites: requisitesCallback = (members, donor, addressees) => {
  if (!addressees.length) throw 'Необходим адресат'
  if (addressees.some(addressee => addressee === donor)) throw 'Принципал не может быть адресатом'
  return addressees
}
const giveMiddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, giveRequisites, getExecuteTransaction(ctx)))
}

export {
  buyMiddleware,
  orderMiddleware,
  payMiddleware,
  giveMiddleware,
  buyRequisites,
  orderRequisites,
  payRequisites,
  giveRequisites,
  transactionCommand,
}
