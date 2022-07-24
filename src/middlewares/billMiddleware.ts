import { Markup } from 'telegraf'

import { escapeChars } from '../constants'
import { listMembers, updateKeyboard } from '../constants/functions'
import { getBill, getDonorsDebtors } from '../constants/billFunctions'
import { listManageKeyboard } from './manageMiddlewares'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { PrismaChatContext, MemberWithLink } from '../constants/types'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

const listKeyboard = async (ctx: PrismaChatContext) => {
  const members = await getBill(ctx)
  const totalBalance = members.reduce((total, member) => total + member.totalSum, 0)
  const unfrozenBalance = members.reduce((unfrozen, member) => member.active ? unfrozen + member.unfrozenSum : unfrozen, 0)
  
  const activeMembers = members.filter(member => member.active)
  const memberButtons = activeMembers.map((member) => {
    const data = ['op', member.account].join(';')
    const sum = member.unfrozenSum !== member.totalSum ? member.unfrozenSum : ''
    return [Markup.button.callback(`${member.displayName()} ${member.totalSum} ${sum}`, data)]
  })
  
  let billText
  if (activeMembers.length !== 0) {
    memberButtons.push([Markup.button.callback('/order - заказ на счет или по депозиту', ['ad', '', '/order'].join(';'))])
    
    billText = `Список дебетов и долгов_\\(со знаком минус\\)_\n` +
               `Общий баланс _\\(внешний дебет/долг\\)_: *${escapeChars(totalBalance.toString())}*\n`
    if (unfrozenBalance !== totalBalance) {
      billText += `Баланс незамороженных участников: *${escapeChars(unfrozenBalance.toString())}*\n`
    }
  } else {
    return await listManageKeyboard(ctx)
  }
  
  memberButtons.push([Markup.button.callback('править список', 'mg')])
  memberButtons.push([Markup.button.callback('история операций', 'hs')])
  
  return { text: billText, markup: Markup.inlineKeyboard(memberButtons) }
}

const billMIddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listKeyboard(ctx)
  
  ctx.reply(text, {
    reply_to_message_id: ctx.message.message_id,
    reply_markup: markup.reply_markup,
    parse_mode: 'MarkdownV2'
  })
}

const composeCommand: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if(!ctx.callbackQuery.message) return next()
  const message = ctx.callbackQuery.message
  if (!ctx.callbackQuery.data) return
  
  const members = await listMembers(ctx)
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>

  const type = ctx.callbackQuery.data.split(';')[0]
  switch (type) {
    case 'bl':
      ({ text, markup } = await listKeyboard(ctx))
      break
      
    case 'op':
      const opDonor = ctx.callbackQuery.data.split(';')[1]
      const opDonorMember = members.find(member => member.account === opDonor)
      if (!opDonorMember) throw new Error('donor for operaiton is not a member')
      const opDonorLink = opDonorMember.linkName()
      
      const opButtons = [
        [Markup.button.callback('назад', 'bl')],
        [Markup.button.callback('/buy - совместная покупка на компанию', ['ad', opDonor, '/buy'].join(';'))],
        [Markup.button.callback('/give - одалживание или возврат долга', ['ad', opDonor, '/give'].join(';'))],
        [Markup.button.switchToCurrentChat('/pay - оплата счета, внос депозита', [opDonorLink, '/pay'].join(' ') + ' ')],
      ]

      const { principalDebt, principalPart, donorsDebtors } = await getDonorsDebtors(ctx, opDonorMember)
      text = `Дебет/долг участника *${opDonorLink}*: *${escapeChars(principalDebt.toString())}*\n`
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
      
      text += `\nВыберите команду от лица *${opDonorLink}*`
      markup = Markup.inlineKeyboard(opButtons)
      break
      
    case 'ad':
      const adDonor = ctx.callbackQuery.data.split(';')[1]
      const adDonorMember = members.find(member => member.account === adDonor)
      const adDonorLink = adDonorMember ? adDonorMember.linkName() : ''
      
      const [operation, ...addressees] = ctx.callbackQuery.data.split(';').slice(2)
      const addresseeMembers = addressees
        .map(chosen => members.find(member => member.account === chosen))
        .filter((member): member is MemberWithLink => !!member)
      
      let adButtons: InlineKeyboardButton[][] = [
        adDonorMember
          ? [Markup.button.callback('назад', ['op', adDonor].join(';'))]
          : [Markup.button.callback('назад', 'bl')]
      ]
      
      adButtons = adButtons.concat(members.map((member) => {
        const addressee = member.account
        let hide = addressee === adDonor || addressees.some(chosen => chosen === addressee)
        return [Markup.button.callback(
          `${member.displayName()}`,
          [
            'ad',
            adDonor,
            operation,
            ...addressees,
            addressee
          ].join(';'),
          hide,
        )]
      }))
      
      if (operation !== '/give' || addressees.length !== 0) {
        const text = addressees.length ? 'продолжить и ввести сумму' : 'на всех и ввести сумму'
        adButtons.push([Markup.button.switchToCurrentChat(
          text,
          [
            adDonorLink,
            operation,
            ...addresseeMembers.map(member => member.linkName())
          ].join(' ') + ' ',
        )])
      }
      
      switch (addresseeMembers.length) {
        case 0:
          text = `*${adDonorLink}* *${operation}*\nВыберите адресанта`
          break
        case adButtons.length - 3 + Number(!adDonorMember):
          text = `*${adDonorLink}* *${operation}* ` +
                  `*${addresseeMembers.map(member => member.linkName()).join(' ')}*` +
                  `\nВыше перечислены адресанты, нажмите продолжить`
          break
        default:
          text = `*${adDonorLink} ${operation}* ` +
                  `*${addresseeMembers.map(member => member.linkName()).join(', ')}*` +
                  `\nДобавьте адресанта или нажмите продолжить`
          break
      }
      markup = Markup.inlineKeyboard(adButtons)
      break
      
    default: return next()
  }
  
  updateKeyboard(ctx, text, markup)
}

export { getBill, composeCommand }
export default billMIddleware
