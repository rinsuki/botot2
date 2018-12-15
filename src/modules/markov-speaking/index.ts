import IModule from '../../module'
import MessageLike from '../../message-like'
import Ai from '../../ai';
import { User } from '../../misskey'
import { IDatabase } from './database';
import createDatabase from './databases';
import config from '../../config';
import * as moment from 'moment'
import { Body } from 'node-fetch';
const MarkovJa = require('markov-ja')

export default class MarkovSpeakingModule implements IModule {
  public readonly priority = 1
  public readonly name = 'markovSpeaking'
  private ai: Ai
  private markov: any
  private database: IDatabase
  private intervalObj: NodeJS.Timer

  private get sentenceLength(): number {
    function getRandomInt(max) {
      return Math.floor(Math.random() * Math.floor(max))
    }
    if(config.sentenceLengthRange) {
      let l = config.sentenceLengthRange[0]
      let r = config.sentenceLengthRange[1]
      let m = r - 1
      return getRandomInt(m + 1) + 1
    } else return 1
  }

  public install(ai: Ai) {
    this.ai = ai
    this.markov = new MarkovJa()
    this.database = createDatabase(config.database.type, this.markov, this.ai)
    this.database.load()
    if(config.intervalPost) {
      let duration = moment.duration(config.intervalPostDuration.value, config.intervalPostDuration.unit).asMilliseconds()
      if(duration == 0) {
        console.error('Bad duration setting. intervalPost feature is disabled.')
      }
      this.intervalObj = setInterval(async () => {
        let text = ''
        text += this.markov.generate(this.sentenceLength).join('\n')
        let res = await this.ai.api('notes/create', {
          text: text
        })
        let json = await res.json()
        if(json.error) {
          console.error('An error occured while creating the interval post')
          console.error(json.error)
        } else {
          console.log('Successfully posted on setInterval')
        }
      }, duration)
    }
  }

  public learn(sender: string, message: string) {
    if(config.markovSpeaking.blocked.indexOf(sender) < 0) {
      this.markov.learn(message.replace(/(@.+)?\s/, ''))
    }
  }
  public generateUserId(user: any) {
    let res: string = user.username
    if(user.hostLower) res += `@${user.hostLower}`
    else res += `@${config.host}`
    return res
  }
  public onNote(note: any) {
    this.database.updateSave()
    if(note.text) this.learn(this.generateUserId(note.user), note.text)
    console.log(`${note.user.name}(@${note.user.username}): ${note.text}`)
  }
  public onMention(msg: MessageLike): boolean {
    if(msg.text) this.learn(this.generateUserId(msg.user), msg.text)
    
    let speech: string
    try {
      speech = this.markov.generate(this.sentenceLength).join('\n')
    } catch(e) {
      speech = '...'
    }
    if(speech.trim() == '') speech = '...'
    try {
      msg.reply(speech)
    } catch(e) {
      console.error('ERROR! Couldn\'t reply!')
      console.error(e)
      return false
    }
    return true
  }

  public onInterrupted() {
    this.database.onInterrupted()
  }

}