import { Markup } from 'telegraf'
import { getBill, getDonorsDebtors } from './billFunctions'
import { escapeChars } from '.'
import { editErrorHandling, findChat, listMembers, commandName, listTransactions, findPrivateChat } from './functions'

import type { MemberWithLink, MemberWithSum, PrismaChatContext, RecordWithType } from './types'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import type { Page } from '@prisma/client'

export const personalDebtText = async (ctx: PrismaChatContext, DonorMember: MemberWithLink) => {
  let text
  const DonorLink = DonorMember.linkName()
  const { principalDebt, principalPart, donorsDebtors } = await getDonorsDebtors(ctx, DonorMember)
  text = `Дебет/долг участника *${DonorLink}*: *${escapeChars(principalDebt.toString())}*\n`
  if (principalPart !== principalDebt) {
    text += `Дебет/долг без учета замороженных: *${escapeChars(principalPart.toString())}*\n`
  }
  
  const donorsDebtorsRecords = donorsDebtors.map(donorDebtor => {
    let record = `  *${donorDebtor.active ? '' : '❆'}${donorDebtor.linkName()}*` +
                 ` *${escapeChars(donorDebtor.debit.toString())}*`
    if (donorDebtor.debit !== donorDebtor.debitUnfrozen) {
      record += ` *${escapeChars(donorDebtor.debitUnfrozen.toString())}*`
    }
    return record
  })
  
  const debts = donorsDebtorsRecords.filter((record, index) => donorsDebtors[index].debit > 0)
  if (debts.length) {
    text += 'Должен следующим участникам:\n'
    text += debts.join('\n') + '\n'
  }
  const debits = donorsDebtorsRecords.filter((record, index) => donorsDebtors[index].debit < 0)
  if (debits.length) {
    text += 'Должны следующие участники:\n'
    text += debits.join('\n') + '\n'
  }
  return text
}

const balanceText = (members: MemberWithSum[]) => {
  let billText = ''
  const totalBalance = members.reduce((total, member) => total + member.totalSum, 0)
  billText += `Список дебетов и долгов_\\(со знаком минус\\)_\n` +
             `Общий баланс _\\(внешний дебет/долг\\)_: *${escapeChars(totalBalance.toString())}*\n`

  const unfrozenBalance = members.reduce((unfrozen, member) => member.active ? unfrozen + member.unfrozenSum : unfrozen, 0)
  if (unfrozenBalance !== totalBalance) {
    billText += `Баланс незамороженных участников: *${escapeChars(unfrozenBalance.toString())}*\n`
  }
  
  return billText
}

const listMemberButtons = (activeMembers: MemberWithSum[], callBackType: string) => {
  return activeMembers.map((member) => {
    const data = [callBackType, member.account].join(';')
    const sum = member.unfrozenSum !== member.totalSum ? member.unfrozenSum : ''
    return [Markup.button.callback(`${member.displayName()} ${member.totalSum} ${sum}`, data)]
  })
}

export const listCount = async (ctx: PrismaChatContext) => {
  const members = await getBill(ctx)
  const activeMembers = members.filter(member => member.active)
  let countText: string
  let memberButtons: InlineKeyboardButton[][] = []
  countText = balanceText(members)
  
  memberButtons = listMemberButtons(activeMembers, 'pd')
  
  return { text: countText, markup: Markup.inlineKeyboard(memberButtons) }
}

export const listBillKeyboard = async (ctx: PrismaChatContext, pinRemind: boolean = false) => {
  const members = await getBill(ctx)
  const activeMembers = members.filter(member => member.active)
  if (activeMembers.length === 0) return await listManageKeyboard(ctx)
  
  let memberButtons: InlineKeyboardButton[][] = []
  let billText = ''
  billText = balanceText(members)
  
  const pinned = await checkPinned(ctx)
  if (!pinned && pinRemind) billText = 'Это сообщение будет обновляться, вы можете его закрепить\n\n' + billText
  
  memberButtons = listMemberButtons(activeMembers, 'op')
  
  memberButtons.push([Markup.button.callback('/order - заказ на счет или по депозиту', ['ad', '', '/order'].join(';'))])
  
  memberButtons.push([Markup.button.callback('править список', 'mg')])
  memberButtons.push([Markup.button.callback('история операций', 'hs')])
  
  return { text: billText, markup: Markup.inlineKeyboard(memberButtons) }
}

export const listManageKeyboard = async (ctx: PrismaChatContext) => {
  const members = await listMembers(ctx, undefined)
  const activeMembers = members.filter(member => member.active)
  
  let buttons: InlineKeyboardButton[][] = []
  if (activeMembers.length !== 0) buttons = [[Markup.button.callback('назад', 'bl')]]
  
  buttons = buttons.concat(members.map((member) => {
    return [
      Markup.button.callback(`${member.active ? '' : '❆'}${member.displayName()}`, `dp;${member.account}`),
      Markup.button.callback(member.active ? 'заморозить' : 'разморозить',`fz;${member.account}`),
    ]
  }))
  
  let text
  if (members.length !== 0) text = 'Полный список участников'
  else {
    text = 'Список участников пуст'
    buttons = []
  }
  text = text + '\n\nЧтобы добавить участника удерживайте\n👉 /include и введите имя'
  const markup = Markup.inlineKeyboard(buttons)
  return { text, markup }
}

const recalculateAmount = (transaction: RecordWithType) => {
  if (transaction.recipientsQuantity) {
    return transaction.amount / transaction.recipientsQuantity * transaction.recipients.length
  }
  return transaction.amount
}

const composeCommand = (transaction: RecordWithType) => {
  const recipientsLinks = transaction.recipients.map(recipient => 'linkName' in recipient ? recipient.linkName() : '')
  const donorLink = transaction.donor ? transaction.donor.linkName() : ''
  
  return [
    donorLink,
    transaction.donor ? transaction.getType() : transaction.getType() !== 'pay' ? '/order' : '/pay',
    ...recipientsLinks,
    recalculateAmount(transaction)
  ].join(' ')
}

export const listHistoryKeyboard = async (ctx: PrismaChatContext, from?: number | bigint) => {
  if (!ctx.chat) throw new Error('callBack is not from chat')
  
  const chatId = await findChat(ctx)

  const last = await ctx.prisma.record.findFirst({
    where: {
      chatId
    },
    orderBy: {
      id: 'desc'
    }
  })
  
  let buttons: InlineKeyboardButton[][] = []
  buttons = [[Markup.button.callback('назад', 'bl')]]
  
  let text
  if (!last) {
    text = 'Список пуст'
  } else {
    if (!from) from = last.id - 9n

    const transactions = await listTransactions(ctx, from)
    
    const commandButtonsPromises = transactions.map(async (transaction) => {
      return [
        Markup.button.switchToCurrentChat((transaction.active ? '' : '↷ ') + commandName(transaction), composeCommand(transaction)),
        Markup.button.callback(transaction.active ? 'пропустить' : 'восстановить', `${transaction.active ? 'ia' : 'ac'};${from};${transaction.id}`),
      ]
    })
    const commandButtons = await Promise.all(commandButtonsPromises)
    buttons = buttons.concat(commandButtons)
  
    if ((Number(from) + 10) > Number(last.id)) {
      const anyActive = await ctx.prisma.record.findFirst({
        select: {
          id: true,
        },
        where: {
          chatId,
          active: true,
        }
      })
      if (!anyActive) {
        buttons.push([
          Markup.button.callback('восстановить все', `rs`)
        ])
      } else {
        buttons.push([
          Markup.button.callback('пропустить все', `om`)
        ])
      }
    }
    
    buttons.push([
      Markup.button.callback('предыдущие', `hs;${Number(from) - 10}`, Number(from) <= 1),
      Markup.button.callback('следующие', `hs;${Number(from) + 10}`, (Number(from) + 10) > Number(last.id)),
    ])
    
    text = 'Список всех операций\n\nПоследние пропущенные будут заменены при следующей операции'
  }
  
  const markup = Markup.inlineKeyboard(buttons)
  return { text, markup}
}

export const billMessageUpdate = async (ctx: PrismaChatContext, old?: boolean) => {
  if (!ctx.chat) return
  
  const chatId = await findChat(ctx)
  const chat = await ctx.prisma.chat.findUnique({
    where: {
      id: chatId
    }
  })
  if (!chat) return
  if (chat.billMessageId) {
    let text: string
    let markup: Markup.Markup<InlineKeyboardMarkup>
    switch (chat.billPage) {
      case 'hs':
        ({ text, markup } = await listHistoryKeyboard(ctx))
        break
        
      case 'mg':
        ({ text, markup } = await listManageKeyboard(ctx))
        break
        
      case 'bl':
      default:
        ({ text, markup } = await listBillKeyboard(ctx, old))
        break
    }
    editErrorHandling(async () => {
      const privateChat = await findPrivateChat(ctx)
      await ctx.telegram.editMessageText(
        Number(privateChat),
        Number(chat.billMessageId),
        undefined,
        text,
        { reply_markup: markup.reply_markup, parse_mode: 'MarkdownV2' },
      )
    })
  }
  
  if (chat.countMessageId) {
    const { text, markup } = await listCount(ctx)
    
    editErrorHandling(async () => {
      await ctx.telegram.editMessageText(
        Number(chatId),
        Number(chat.countMessageId),
        undefined,
        text,
        { reply_markup: markup.reply_markup, parse_mode: 'MarkdownV2' },
      )
    })
  }

}

export const checkPinned = async (ctx: PrismaChatContext, billOrCount: 'billMessageId' | 'countMessageId' = 'billMessageId') => {
  if (!ctx.chat) return false
  const chat = await ctx.telegram.getChat(ctx.chat.id)
  if (chat.pinned_message) {
    const chatId = await findChat(ctx)
    const prismaChat = await ctx.prisma.chat.findUnique({
      where: {
        id: chatId
      }
    })
    if (!prismaChat) return false
    if (Number(prismaChat[billOrCount]) === chat.pinned_message.message_id) return true
  }
  return false
}

export const billTypeUpdate = async (ctx: PrismaChatContext, type: Page, checkMessageId?: number, billMessageId?: number) => {
  if (!ctx.chat) return
  if (billMessageId) {
    const pinned = await checkPinned(ctx)
    if (pinned) return
    await billMessageUpdate(ctx, false)
  }
  
  if (!checkMessageId && !billMessageId) return

  const chatId = await findChat(ctx)
  await ctx.prisma.chat.updateMany({
    where: {
      id: chatId,
      billMessageId: checkMessageId,
    },
    data: {
      billPage: type,
      billMessageId,
    }
  })
}
