import { Markup } from 'telegraf'

import type { MiddlewareFn, NarrowedContext, Context, Types } from 'telegraf'
import type { PrismaChatContext, MemberWithLink } from '../constants/types'
import type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  InlineQueryResultArticle,
} from 'telegraf/typings/core/types/typegram'
import { listMembers, evaluate } from '../constants/functions'
import { numericSymbolicFilter } from '../constants'

const getBill = async (ctx: PrismaChatContext) => {
  const membersWithName = await listMembers(ctx, undefined)
  
  const promisesWithSum = membersWithName.map(async (member) => {
    const donorInPromise = ctx.prisma.record.findMany({
      select: {
        amount: true,
        recipients: {
          select: {
            member: {
              select: { active: true }
            }
          }
        },
        recipientsQuantity: true,
      },
      where: {
        chatId: member.chatId,
        donorAccount: member.account,
        active: true,
      }
    })
    const recepientInPromise = ctx.prisma.record.findMany({
      select: {
        amount: true,
        recipients: {
          select: {
            member: {
              select: {
                active: true
              }
            }
          }
        },
        recipientsQuantity: true,
        donor: { select: { active: true }},
        hasDonor: true,
      },
      where: {
        chatId: member.chatId,
        recipients: { some: { account: member.account } },
        active: true,
      }
    })
    const [donorIn, recepientIn]  = await Promise.all([donorInPromise, recepientInPromise])
    
    const unfrozenTransactions = donorIn.map((record) => {
      if (record.recipientsQuantity) {
        const sum = record.amount * (1 + 1/record.recipientsQuantity)
        const frozenRecipients = record.recipients.filter(recipient => !recipient.member.active).length
        const participants = 1 + record.recipientsQuantity - frozenRecipients
        return participants ? sum * (1 - 1 / participants) : record.amount
      } else return record.amount
    }).concat(recepientIn.map((record) => {
      if (!record.hasDonor || record.donor?.active) {
        const sum = record.amount * (1 + Number(record.hasDonor)/record.recipientsQuantity)
        const frozenRecipients = record.recipients.filter(recipient => !recipient.member.active).length
        const participants = Number(record.hasDonor) + record.recipientsQuantity - frozenRecipients
        return participants ? -sum * (1 / participants) : 0
      } else return 0
    }))
    const unfrozenSum =  Math.trunc(unfrozenTransactions.reduce((sum, transaction) => sum + transaction, 0)/100)
    
    const transactions = donorIn.map(record => record.amount)
      .concat(recepientIn.map(record => -record.amount/record.recipientsQuantity))
    const totalSum =  Math.trunc(transactions.reduce((sum, transaction) => sum + transaction, 0)/100)
    
    return { ...member, unfrozenSum, totalSum }
  })
  
  return Promise.all(promisesWithSum)
}

const listKeyboard = async (ctx: PrismaChatContext) => {
  const members = await getBill(ctx)
  const totalBalance = members.reduce((total, member) => total + member.totalSum, 0)
  const unfrozenBalance = members.reduce((unfrozen, member) => member.active ? unfrozen + member.unfrozenSum : unfrozen, 0)
  
  const activeMembers = members.filter(member => member.active)
  const memberButtons: InlineKeyboardButton[][] = activeMembers.map((member) => {
    
    const data = ['op', member.account].join(';')
     return [Markup.button.callback(`${member.displayName()} ${member.unfrozenSum} ${member.totalSum - member.unfrozenSum}`, data)]
  })
  memberButtons.push([Markup.button.callback('/order - заказ на счет или по депозиту', ['ad', '', '/order'].join(';'))])
  memberButtons.push([Markup.button.callback('править список', 'mg')])
  
  const billText = `Список дебетов и долгов _\\(со знаком минус\\)_\n` +
                   `Баланс незамороженных участников: *${unfrozenBalance.toString().replace('-', '\\-')}*\n` +
                   `Общий баланс _\\(внешний дебет/долг\\)_: *${totalBalance.toString().replace('-', '\\-')}*`
  
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
      const opDonorLink = opDonorMember ? opDonorMember.linkName() : ''
      
      const opButtons = [
        [Markup.button.callback('назад', 'bl')],
        [Markup.button.callback('/buy - совместная покупка на компанию', ['ad', opDonor, '/buy'].join(';'))],
        [Markup.button.callback('/give - одалживание или возврат долга', ['ad', opDonor, '/give'].join(';'))],
        [Markup.button.switchToCurrentChat('/pay - оплата счета, внос депозита', [opDonorLink, '/pay'].join(' ') + ' ')],
      ]
      text = `Выберите команду от лица *${opDonorLink}*`
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
  
  if ('text' in ctx.callbackQuery.message && ctx.callbackQuery.message.text === text) return next()
  ctx.telegram.editMessageText(
    message.chat.id,
    message.message_id,
    undefined,
    text,
    { parse_mode: 'MarkdownV2', reply_markup: markup.reply_markup }
  )
}

const rectifyCommand: MiddlewareFn<NarrowedContext<Context, Types.MountMap['inline_query']>> = (ctx, next) => {
  const query = ctx.inlineQuery.query

  const hasCommands = /(?:.*((\/include)|(\/pay)|(\/order)|(\/buy)|(\/give))+.*)/
  if (!hasCommands.test(query)) return ctx.answerInlineQuery([])
  
  const parameters = query.split(' ')
  let numeric: string | undefined = ''
  numeric = parameters.find(parameter => numericSymbolicFilter.test(parameter))
  if (!numeric) return ctx.answerInlineQuery([])
  
  const text = query.replace(numeric, numeric.replace(/([+()\-*\/])/g, match => '\\' + match))
  let sum: number
  try {
    sum = Math.trunc(evaluate(numeric) * 100)/100
  } catch (err) {
    if (typeof err === 'string') {
      return ctx.answerInlineQuery([])
    } else throw err
  }
  
  const result: InlineQueryResultArticle = {
    type: 'article',
    id: sum.toString(),
    title: `Выполнить операцию на сумму ${sum}`,
    input_message_content: { message_text: text, parse_mode: 'MarkdownV2' },
  }
  ctx.answerInlineQuery([result])
}

export { getBill, composeCommand, rectifyCommand }
export default billMIddleware
