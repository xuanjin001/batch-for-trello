const h = require('react-hyperscript')
const React = require('react')
const ReactDOM = require('react-dom')
const Trello = require('trello-browser')
const pThrottle = require('p-throttle')
const Select = require('react-select')

const trello = new Trello('ac61d8974aa86dd25f9597fa651a2ed8')

var App = React.createClass({
  getInitialState () {
    return {
      user: null,
      boards: [],
      boardClicked: null,
      sBoard: null,
      allMarked: false
    }
  },

  render () {
    var screen = this.state.user
      ? this.state.sBoard
        ? h('div', [
          this.state.sBoard.cards.find(c => c.marked)
            ? React.createElement(actions, {
              marked: this.state.sBoard.cards.filter(c => c.marked),
              boardData: this.state.sBoard,
              doneAction: this.selectBoard(this.state.sBoard.index)
            })
            : '',
          board({
            selectedBoard: this.state.sBoard,
            allMarked: this.state.allMarked,
            unselectBoard: this.unselectBoard,
            markCard: this.markCard,
            markAll: this.markAll
          })
        ])
        : boardList({
          boards: this.state.boards,
          clicked: this.state.boardClicked,
          selectBoard: this.selectBoard
        })
      : ''

    return h('div', [
      h('.pure-menu.pure-menu-horizontal', [
        h('span.pure-menu-heading', document.title),
        h('ul.pure-menu-list', [
          h('li.pure-menu-item', [
            this.state.user
            ? h('a.pure-menu-link', {onClick: this.logout},
                `${this.state.user.name}, logout`
              )
            : h('a.pure-menu-link', {onClick: this.login}, 'Log in with Trello')
          ])
        ])
      ]),
      h('div#main', [screen])
    ])
  },

  componentDidMount () {
    var token = window.localStorage.getItem('token')
    if (token) {
      trello.setToken(token)
      this.getUserData()
    }
  },

  getUserData () {
    trello.get(`/1/tokens/${trello.token}/member`, {fields: 'username'})
    .then(user => {
      this.setState({
        user: {
          name: user.username,
          token: trello.token,
          id: user.id
        }
      })
    })
    .then(this.getBoardsData)
    .catch(e => console.log('fetchUserData error', e.stack))
  },

  login () {
    trello.auth({
      name: document.title,
      scope: {
        read: true,
        write: true,
        account: false
      },
      expiration: 'never'
    })
    .catch(e => console.log('trello auth error', e.stack))
    .then(() => {
      window.localStorage.setItem('token', trello.token)

      this.getUserData()
    })
  },

  logout () {
    window.localStorage.removeItem('token')
    this.setState({user: null})
  },

  getBoardsData () {
    trello.get(`/1/members/${this.state.user.id}/boards`, {
      filter: 'open',
      fields: 'name,shortLink,starred'
    })
    .then(boards => {
      this.setState({
        boards: boards.sort((a, b) => b.starred - a.starred)
      })
    })
    .catch(e => console.log('error on getBoardsData', e.stack))
  },

  unselectBoard () {
    this.setState({
      sBoard: null,
      boardClicked: null
    })
  },

  selectBoard (i) {
    return () => {
      this.setState({
        boardClicked: i
      })

      var board = this.state.boards[i]

      Promise.all([
        trello.get(`/1/boards/${board.id}/cards`, {
          filter: 'open',
          fields: 'name,pos,idList,idLabels,idMembers',
          members: true,
          member_fields: 'username'
        }),
        trello.get(`/1/boards/${board.id}/labels`, {fields: 'color,name'}),
        trello.get(`/1/boards/${board.id}/members`, {fields: 'username'}),
        trello.get(`/1/boards/${board.id}/lists`, {
          filter: 'all',
          fields: 'closed,name,pos'
        })
      ])
      .then(results => {
        var labelMap = {}
        var labels = []
        results[1].forEach(label => {
          if (!label.name) {
            label.name = `[ ${label.color} ]`
          }
          labelMap[label.id] = label
          labels.push(label)
        })
        var memberMap = {}
        var members = []
        results[2].forEach(member => {
          memberMap[member.id] = member
          members.push(member)
        })
        var listMap = {}
        var lists = []
        results[3].forEach(list => {
          listMap[list.id] = list
          lists.push(list)
        })

        var cards = []
        results[0].forEach(card => {
          card.labels = card.idLabels.map(idl => labelMap[idl])
          card.members = card.idMembers.map(idl => memberMap[idl])
          card.list = listMap[card.idList]
          if (card.list.closed) {
            return // do not show "open" cards if they are in closed lists
          }

          cards.push(card)
        })

        this.setState({
          sBoard: {
            index: i,
            name: board.name,
            id: board.id,
            lists: lists,
            labels: labels,
            members: members,
            cards: cards.sort((a, b) => {
              if (a.list.pos === b.list.pos) {
                return a.pos - b.pos
              }
              return a.list.pos - b.list.pos
            })
          }
        })
      })
      .catch(e => console.log('selectBoard error', e.stack))
    }
  },

  markCard (index) {
    return () => {
      this.setState(prev => {
        prev.sBoard.cards[index].marked = !prev.sBoard.cards[index].marked
        return prev
      })
    }
  },

  markAll () {
    this.setState(prev => {
      if (prev.allMarked) {
        prev.allMarked = false
        prev.sBoard.cards.forEach(c => c.marked = false)
      } else {
        prev.allMarked = true
        prev.sBoard.cards.forEach(c => c.marked = true)
      }
    })
  }
})

function boardList (props) {
  var boards = props.boards
  var clicked = props.clicked

  return h('table.pure-table.pure-table-bordered', [
    h('thead', [
      h('tr', [
        h('th', {colSpan: 2}, 'boards')
      ])
    ]),
    h('tbody', boards.map((board, i) =>
      h('tr', {onClick: props.selectBoard(i), className: clicked === i ? 'marked' : ''}, [
        h('td', [
          h('a', board.name)
        ]),
        h('td', [
          h('a', {
            href: `https://trello.com/b/${board.shortLink}`,
            target: '_blank'
          }, board.shortLink)
        ])
      ])
    ))
  ])
}

function board (props) {
  var selectedBoard = props.selectedBoard
  var allMarked = props.allMarked

  return h('table.pure-table.pure-table-bordered', [
    h('thead', [
      h('tr', [
        h('th', {colSpan: 4}, selectedBoard.name),
        h('td', {onClick: props.unselectBoard}, [
          h('a', '↰')
        ])
      ]),
      h('tr', [
        h('td', 'Name'),
        h('td', [
          h('input', {type: 'checkbox', onClick: props.markAll, checked: allMarked})
        ]),
        h('td', 'List'),
        h('td', 'Labels'),
        h('td', 'Members')
      ])
    ]),
    h('tbody', selectedBoard.cards.map((c, index) =>
      h('tr', {
        className: c.marked ? 'marked' : '',
        onClick: props.markCard(index)
      }, [
        h('td', c.name),
        h('td', [
          h('label', [
            h('input', {type: 'checkbox', checked: !!c.marked})
          ])
        ]),
        h('td', c.list.name),
        h('td', c.labels.map(label =>
          h('a.trello-label', {className: label.color}, label.name)
        )),
        h('td', c.members.map(member => member.username).join(', '))
      ])
    ))
  ])
}

var actions = React.createClass({
  getInitialState () {
    return {
      action: null,
      arg: null,
      message: null
    }
  },

  actions: [
    'Move to list',
    'Add label',
    'Add user',
    'Archive',
    'Delete'
    // remove label x, remove all labels, remove member x, remove all members
  ],

  render () {
    var argoptions
    var multi = false
    switch (this.state.action) {
      case 'Move to list':
        argoptions = this.props.boardData.lists
        break
      case 'Add label':
        argoptions = this.props.boardData.labels
        multi = true
        break
      case 'Add user':
        argoptions = this.props.boardData.members
        multi = true
        break
      case null: // important for the confirmation button
        argoptions = []
        break
      default:
        argoptions = null
    }

    return h('form.action', {onSubmit: this.performAction}, [
      h('.select-wrapper', [
        h(Select, {
          onChange: this.selectAction,
          options: this.actions.map(act => ({value: act, label: act})),
          value: this.state.action
        })
      ]),
      argoptions && argoptions.length
        ? h('.select-wrapper', [
          h(Select, {
            onChange: this.selectArg,
            multi: multi,
            options: argoptions.map(opt => ({value: opt.id, label: opt.name || opt.username, className: opt.color})),
            value: this.state.arg
          })
        ])
        : '',
      this.state.message
      ? h('button.pure-button.pure-button-primary', {disabled: true}, this.state.message)
      : argoptions && this.state.arg || argoptions == null
        ? h('button.pure-button.pure-button-primary',
            `Perform "${this.state.action}" action on ${this.props.marked.length} cards`)
        : h('button.pure-button.pure-button-disabled',
            {disabled: true},
            'Choose an action to perform on the selected cards')
    ])
  },

  selectAction (option) {
    this.setState({
      action: option.value,
      arg: null,
      message: null
    })
  },

  selectArg (option) {
    this.setState({
      arg: Array.isArray(option) ? option.map(o => o.value) : option.value
    })
  },

  performAction (e) {
    e.preventDefault()
    if (!window.confirm('Are you sure? This is irreversible!')) return

    this.waitingAction = setTimeout(() => {
      this.setState({
        message: 'This may take a while'
      })
    }, 4000)

    var throttledAction = pThrottle(card => {
      switch (this.state.action) {
        case 'Move to list':
          return trello.put(`/1/cards/${card.id}`, {idList: this.state.arg})
        case 'Add label':
          return Promise.all(this.state.arg.map(idlbl =>
            trello.post(`/1/cards/${card.id}/idLabels`, {value: idlbl})
            .catch(() => true /* will fail if label is already in */)
          ))
        case 'Add user':
          return trello.put(`/1/cards/${card.id}`, {idMembers: this.state.arg.join(',')})
        case 'Archive':
          return trello.post(`/1/cards/${card.id}/closed`, {value: true})
        case 'Delete':
          return trello.del(`/1/cards/${card.id}`)
      }
    }, 75, 10000)

    Promise.all(this.props.marked.map(card => throttledAction(card)))
    .then(cres => {
      clearTimeout(this.waitingAction)
      this.setState(this.getInitialState())
      this.setState({
        message: 'Done!'
      })
      this.props.doneAction()
    })
    .catch(e => {
      console.log('error performing action', this.state, this.props.marked, e)
      this.setState(this.getInitialState())
      this.setState({
        message: 'An error ocurred. See developer console.'
      })
    })
  }
})

ReactDOM.render(React.createElement(App), document.body)
