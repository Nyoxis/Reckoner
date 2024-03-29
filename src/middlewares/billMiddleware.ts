import { Markup } from 'telegraf'

import { escapeChars } from '../constants'
import { findPrivateChat, listMembers, updateKeyboard } from '../constants/functions'
import { getBill, getDonorsDebtors } from '../constants/billFunctions'
import { listBillKeyboard, billTypeUpdate, personalDebtText } from '../constants/billUpdateFunctions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { MemberWithLink } from '../constants/types'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

const billMIddleware: MiddlewareFn<NarrowedContext<Context, Types.MountMap['text']>> = async (ctx) => {
  const { text, markup } = await listBillKeyboard(ctx, true)
  const privateChat = await findPrivateChat(ctx)
  
  let extra: Types.ExtraReplyMessage = {
    reply_markup: markup.reply_markup,
    parse_mode: 'MarkdownV2',
  }
  if (ctx.chat.id === Number(privateChat)) extra = {... extra, reply_to_message_id: ctx.message.message_id}
  
  const replyMessage = await ctx.telegram.sendMessage(
    Number(privateChat),
    text,
    extra,
  )
  await billTypeUpdate(ctx, 'bl', undefined, replyMessage.message_id)
}

const billActions: MiddlewareFn<NarrowedContext<Context, Types.MountMap['callback_query']>> = async (ctx, next) => {
  if(!ctx.callbackQuery.message) return next()
  const message = ctx.callbackQuery.message
  if (!ctx.callbackQuery.data) return
  
  const members = await listMembers(ctx)
  let text: string
  let markup: Markup.Markup<InlineKeyboardMarkup>
  
  const type = ctx.callbackQuery.data.split(';')[0]
  switch (type) {
    case 'bl':
      ({ text, markup } = await listBillKeyboard(ctx))
      await billTypeUpdate(ctx, 'bl', ctx.callbackQuery.message.message_id)
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
        [Markup.button.switchToCurrentChat('/pay - оплата счета, внос депозита', [opDonorMember?.linkNameUnescaped(), '/pay'].join(' ') + ' ')],
      ]
      
      text = await personalDebtText(ctx, opDonorMember)
      
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
            adDonorMember?.linkNameUnescaped(),
            operation,
            ...addresseeMembers.map(member => member.linkNameUnescaped())
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
                  `*${addresseeMembers.map(member => member.linkName()).join(' ')}*` +
                  `\nДобавьте адресанта или нажмите продолжить`
          break
      }
      markup = Markup.inlineKeyboard(adButtons)
      break
      
    default: return next()
  }
  
  updateKeyboard(ctx, text, markup)
}

export { getBill, billActions }
export default billMIddleware
