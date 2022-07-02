import mexp from 'math-expression-evaluator'

import { errorHandling } from '../constants/functions'

import type { Middleware, NarrowedContext, Context, Types } from 'telegraf'
import type { Member, Record } from '@prisma/client'
import type { MemberWithUsername } from '../constants/accountKind'

type SpecificContext = Pick<NarrowedContext<Context, Types.MountMap['text']>, 'chat' | 'prisma' | 'telegram'> & {
  message: Pick<NarrowedContext<Context, Types.MountMap['text']>['message'], 'message_id' | 'text' | 'from'>
}

const getSimpleMember = (member: MemberWithUsername | undefined) => member ? { account: member.account, chatId: member.chatId } : undefined

const getExecuteTransaction = (
  ctx: NarrowedContext<Context, Types.MountMap['text']>,
) => {
  return async (
    donor: Member | undefined,
    recipients: Member[],
    amount: number,
  ) => {
    const firstActive = await ctx.prisma.record.findFirst({
      select: {
        id: true
      },
      orderBy: {
        id: 'desc'
      },
      where: {
        active: true
      },
    })
    const nextInactive = await ctx.prisma.record.findFirst({
      select: {
        id: true
      },
      orderBy: {
        id: 'asc'
      },
      where: {
        active: false
      },
      cursor: {
        id: firstActive ? firstActive.id : 0
      }
    })
    
    const donorArg = donor ? { connect: { chatId_account: donor } } : {}
    const data = {
      chat: {
        connect: { id: ctx.chat.id }
      },
      message_id: ctx.message.message_id,
      donor: donorArg,
      recipients: {
        createMany: {
          data: recipients
        }
      },
      amount: Math.trunc(amount),
      active: true,
    }
    let transaction: Record
    if (nextInactive) {
      transaction = await ctx.prisma.record.update({
        where: {
          id: nextInactive.id
        },
        data: { id: nextInactive.id, ...data }
      })
    } else {
      transaction = await ctx.prisma.record.create({
        data,
      })
    }
  
    const reply = await ctx.reply(transaction.amount.toString(), { reply_to_message_id: ctx.message.message_id })
    await ctx.prisma.record.update({
      where: {
        id: transaction.id
      },
      data: {
        reply_id: reply.message_id
      }
    })
  }
}

type requisitesCallback = (
  members: MemberWithUsername[],
  donor: MemberWithUsername | undefined,
  addressees: MemberWithUsername[],
  sum: number,
) => {
  recipients: MemberWithUsername[],
  amount: number,
} | Promise<{
  recipients: MemberWithUsername[],
  amount: number,
}>

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
  const parameters = ctx.message.text.split(' ').slice(1)
  /*if (!parameters.length) {
    ctx.reply('a list of users', { reply_to_message_id: ctx.message.message_id })
  }*/
  
  let members: MemberWithUsername[] = ctx.prisma.computeKind(
    await ctx.prisma.member.findMany({
      where: {
        chatId: ctx.chat.id
      }
    })
  )
  const promises = members.map(async (member) => {
    if (member.kind === 'USER') {
      const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, Number.parseInt(member.account))
      return {...member, username: chatMember.user.username ? chatMember.user.username : chatMember.user.first_name}
    } else return member
  })
  members = await Promise.all(promises)
  
  return async () => {
    let numeric: number
    let donor: MemberWithUsername | undefined
    let addresseeNames: string[]
    //first parameter is numberic
    if (/^[0-9()+\-*/.]+$/.test(parameters[0])) {
      numeric = Number.parseFloat(mexp.eval(parameters[0]))
      addresseeNames = parameters.slice(1)
      if (isSubjective) {
        donor = members.find(member => member.account === ctx.message.from.id.toString())
        if (!donor) throw 'you are not included'
      } else donor = undefined
    } else if (/^[0-9()+\-*/.]+$/.test(parameters[1])) {
      if (!isSubjective) throw 'operation does not require principal'
      numeric = Number.parseFloat(mexp.eval(parameters[1]))
      addresseeNames = parameters.slice(2)
      donor = members.find(member => (member.kind === 'USER')
          ? member.username === parameters[0].slice(1)
          : member.account === parameters[0]
      )
      if (!donor) throw 'cannot find principal'
    } else throw 'could not resolve invoice'
    
    const sum = Math.trunc(numeric * 100)
    
    const missing = addresseeNames.filter(addressee => !members.some(member => member.kind === 'USER'
        ? member.username === addressee.slice(1)
        : member.account === addressee
    ))
    if (missing.length) throw `member${missing.length>1 ? 's' : ''} ${missing.join(', ')} not found`
    
    const addressees = members.filter(member => (member.kind === 'USER')
        ? addresseeNames.some(addressee => (addressee.slice(1) === member.username))
        : addresseeNames.some(addressee => addressee === member.account)
    )
    
    const { recipients, amount } = await getTransactionRequisites(members, donor, addressees, sum)
    const simpleDonor: Member | undefined = getSimpleMember(donor)
    const isDefined = (member: Member | undefined): member is Member => !!member
    const simpleRecipients: Member[] = recipients.map(getSimpleMember).filter(isDefined)
    execute(simpleDonor, simpleRecipients, amount)
  }
}

const buyRequisites: requisitesCallback = (members, donor, addressees, sum) => {
  let recipients
  if (!addressees.length) {
    recipients = members.filter(member => member !== donor)
  } else recipients = addressees
  if (recipients.some(addressee => addressee === donor)) throw 'the principal must not be the addressee'
  const amount = sum*(1-1/(recipients.length+1))
  return { recipients, amount }
}
const buyMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, buyRequisites, getExecuteTransaction(ctx)))
}

const orderRequisites: requisitesCallback = (members, donor, addressees, sum) => {
  let recipients
  if (!addressees.length) {
    recipients = members.filter(member => member !== donor)
  } else recipients = addressees
  return { recipients, amount: sum }
}
const orderMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, orderRequisites, getExecuteTransaction(ctx), false))
}

const payRequisites: requisitesCallback = (members, donor, addressees, sum) => {
  if (addressees.length) throw 'operation does not require addressees'
  const recipients: MemberWithUsername[] = []
  return { recipients, amount: sum }
}
const payMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  errorHandling(ctx, await transactionCommand(ctx, payRequisites, getExecuteTransaction(ctx)))
}

const giveRequisites: requisitesCallback = (members, donor, addressees, sum) => {
  if (!addressees.length) throw 'member name is expected'
  return { recipients: addressees, amount: sum }
}
const giveMiddleware: Middleware<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
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
