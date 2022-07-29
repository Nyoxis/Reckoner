
import { listMembers, findChat } from './functions'

import type { PrismaChatContext, MemberWithLink, MemberWithSum } from './types'

const findTransactions = async (ctx: PrismaChatContext, member: MemberWithLink | undefined) => {
  const chatId = await findChat(ctx)
  const whereDonor = member ? {
    chatId,
    donorAccount: member.account,
    active: true,
  } : {
    chatId,
    hasDonor: false,
    active: true,
  }
  const donorInPromise = ctx.prisma.record.findMany({
    select: {
      amount: true,
      recipients: {
        select: {
          member: {
            select: {
              account: true,
              active: true,
            }
          }
        }
      },
      recipientsQuantity: true,
    },
    where: whereDonor,
  })

  const whereRecipients = member ? {
      chatId,
      recipients: { some: { account: member.account} },
      active: true,
    } : {
      chatId,
      recipientsQuantity: 0,
      active: true,
    }
  const recipientInPromise = await ctx.prisma.record.findMany({
    select: {
      amount: true,
      recipients: {
        select: {
          member: {
            select: {
              account: true,
              active: true,
            }
          }
        }
      },
      recipientsQuantity: true,
      donor: { select: {
        account: true,
        active: true,
      }},
      hasDonor: true,
    },
    where: whereRecipients,
  })
  return await Promise.all([donorInPromise, recipientInPromise])
}

export const getBill = async (ctx: PrismaChatContext): Promise<MemberWithSum[]> => {
  const membersWithName = await listMembers(ctx, undefined)
  
  const promisesWithSum = membersWithName.map(async (member) => {
    const [donorIn, recipientIn] = await findTransactions(ctx, member)
    
    const unfrozenTransactions = donorIn.map((record) => record.amount)
      .concat(recipientIn.map((record) => {
      if (!record.hasDonor || record.donor?.active && record.recipientsQuantity) {
        const nonDeletedPart = record.amount / record.recipientsQuantity * record.recipients.length
        const unfrozenParticipants = record.recipients.filter(recipient => recipient.member.active).length
        const unfrozen = unfrozenParticipants ? nonDeletedPart / unfrozenParticipants : 0
        return -unfrozen
      } else return -record.amount/record.recipientsQuantity
    }))
    const unfrozenSum =  Math.trunc(unfrozenTransactions.reduce((sum, transaction) => sum + transaction, 0)/100)
    
    const transactions = donorIn.map(record => record.amount)
      .concat(recipientIn.map(record => -record.amount/record.recipientsQuantity))
    const totalSum =  Math.trunc(transactions.reduce((sum, transaction) => sum + transaction, 0)/100)
    
    return { ...member, unfrozenSum, totalSum }
  })
  
  return Promise.all(promisesWithSum)
}

export const getDonorsDebtors = async (ctx: PrismaChatContext, principal: MemberWithLink) => {
  const members = await getBill(ctx)
  const principalWithSum = members.find(member => member.account === principal.account)
  if (!principalWithSum) throw new Error('principal not a member')
  const [ principalDebt, principalPart ] = [ principalWithSum.totalSum, principalWithSum.unfrozenSum ]
  
  const [donorIn, recipientIn] = await findTransactions(ctx, principal)
  const [withoutDonor, withoutRecipients] = await findTransactions(ctx, undefined)
  
  let totalOrders: number = 0
  let totalPays: number = 0
  let totalOrdersUnfrozen: number = 0
  let totalPaysUnfrozen: number = 0
  let membersWithOrders = members.map((member) => {
    let memberOrdersUnfrozen: number = 0
    let memberOrders: number = 0
    withoutDonor.forEach((transaction) => {
      if (transaction.recipients.some(recipient => recipient.member.account === member.account)) {
        memberOrders = memberOrders - transaction.amount/transaction.recipientsQuantity
        
        const nonDeletedPart = transaction.amount / transaction.recipientsQuantity * transaction.recipients.length
        const unfrozenParticipants = transaction.recipients.filter(recipient => recipient.member.active).length
        const unfrozen = unfrozenParticipants ? nonDeletedPart / unfrozenParticipants : 0
        memberOrdersUnfrozen = memberOrdersUnfrozen - unfrozen
      }
    })
    withoutRecipients.forEach((transaction) => {
      if (transaction.donor?.account === member.account) {
        memberOrders = memberOrders + transaction.amount
        memberOrdersUnfrozen = memberOrdersUnfrozen + transaction.amount
      }
    })
    if (memberOrders < 0) totalOrders = totalOrders + memberOrders
    if (memberOrders > 0) totalPays = totalPays + memberOrders
    
    if (memberOrdersUnfrozen < 0) totalOrdersUnfrozen = totalOrdersUnfrozen + memberOrdersUnfrozen
    if (memberOrdersUnfrozen > 0) totalPaysUnfrozen = totalPaysUnfrozen + memberOrdersUnfrozen
    
    return { ...member, orders: memberOrders, ordersUnfrozen: memberOrdersUnfrozen }
  })
  
  let principalOrders: number = 0
  let principalPaypart: number = 0
  let principalOrdersUnfrozen: number = 0
  let principalPaypartUnfrozen: number = 0
  membersWithOrders = membersWithOrders.filter(member => {
    if (member.account !== principal.account) return true
    else {
      principalOrders = Math.sign(member.orders) * Math.min(Math.abs(member.orders), Math.abs(totalOrders))
      principalPaypart = member.orders / totalPays
      
      principalOrdersUnfrozen = Math.sign(member.ordersUnfrozen) * Math.min(Math.abs(member.ordersUnfrozen), Math.abs(totalOrdersUnfrozen))
      principalPaypartUnfrozen = member.ordersUnfrozen / totalPaysUnfrozen
    }
  })
  
  const membersWithDebit = membersWithOrders.map((member) => {
    let debit: number = 0
    let debitUnfrozen: number = 0
    recipientIn.forEach((transaction) => {
      if (transaction.donor?.account !== member.account) return
      debit = debit + transaction.amount/transaction.recipientsQuantity
      
      if (!transaction.hasDonor || transaction.donor?.active && transaction.recipientsQuantity) {
        const nonDeletedPart = transaction.amount / transaction.recipientsQuantity * transaction.recipients.length
        const unfrozenParticipants = transaction.recipients.filter(recipient => recipient.member.active).length
        const unfrozen = unfrozenParticipants ? nonDeletedPart / unfrozenParticipants : 0
        debitUnfrozen = debitUnfrozen + unfrozen
      } else debitUnfrozen = debitUnfrozen + transaction.amount/transaction.recipientsQuantity
    })
    donorIn.forEach((transaction) => {
      if (!transaction.recipients.some(recipient => recipient.member.account === member.account)) return
      debit = debit - transaction.amount/transaction.recipientsQuantity
      
      if (member.active && transaction.recipientsQuantity) {
        const nonDeletedPart = transaction.amount / transaction.recipientsQuantity * transaction.recipients.length
        const unfrozenParticipants = transaction.recipients.filter(recipient => recipient.member.active).length
        const unfrozen = unfrozenParticipants ? nonDeletedPart / unfrozenParticipants : 0
        debitUnfrozen = debitUnfrozen - unfrozen
      } else debitUnfrozen = debitUnfrozen - transaction.amount/transaction.recipientsQuantity
    })
    
    const memberDebit = Math.sign(member.orders) * Math.min(Math.abs(member.orders), Math.abs(totalOrders))
    const orderDebit = memberDebit / totalOrders * principalOrders
    if ((memberDebit > 0) && (principalOrders < 0)) debit = debit + orderDebit * member.orders / totalPays
    else if ((memberDebit < 0) && (principalOrders > 0)) debit = debit - orderDebit * principalPaypart
    
    const memberDebitUnfrozen = Math.sign(member.ordersUnfrozen) * Math.min(Math.abs(member.ordersUnfrozen), Math.abs(totalOrdersUnfrozen))
    const orderDebitUnfrozen = memberDebitUnfrozen / totalOrdersUnfrozen * principalOrdersUnfrozen
    if ((memberDebit > 0) && (principalOrders < 0)) debitUnfrozen = debitUnfrozen + orderDebitUnfrozen * member.ordersUnfrozen / totalPaysUnfrozen
      else if ((memberDebit < 0) && (principalOrders > 0)) debitUnfrozen = debitUnfrozen - orderDebitUnfrozen * principalPaypartUnfrozen
    
    return { ...member, debit: Math.trunc(debit/100), debitUnfrozen: Math.trunc(debitUnfrozen/100) }
  })
  
  const donorsDebtors = membersWithDebit.filter(member => member.debit)
  return { principalDebt, principalPart, donorsDebtors }
}

