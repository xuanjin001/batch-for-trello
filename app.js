const h = require('react-hyperscript')
const React = require('react')
const ReactDOM = require('react-dom')
const Trello = require('trello-browser')

const trello = new Trello('ac61d8974aa86dd25f9597fa651a2ed8')

var App = React.createClass({
  getInitialState () {
    return {
      user: null,
      boards: [],
      sBoard: null
    }
  },

  render () {
    var screen = this.state.user
      ? this.state.sBoard
        ? h('table.pure-table', [
          h('thead', [
            h('tr', [
              h('th', {colSpan: 4}, this.state.sBoard.name),
              h('td', {onClick: this.unselectBoard}, [
                h('a', 'back')
              ])
            ]),
            h('tr', [
              h('td', 'Name'),
              h('td', 'List'),
              h('td', 'Labels'),
              h('td', 'Members'),
              h('td', 'Select')
            ])
          ]),
          h('tbody', this.state.sBoard.cards.map(c =>
            h('tr', [
              h('td', c.name),
              h('td', c.list.name),
              h('td', c.labels.map(label =>
                h('a.label', {style: {backgroundColor: label.color}}, label.name)
              )),
              h('td', ''),
              h('td', [
                h('input', {type: 'checkbox'})
              ])
            ])
          ))
        ])
        : h('table.pure-table', [
          h('thead', [
            h('tr', [
              h('th', {colSpan: 2}, 'boards')
            ])
          ]),
          h('tbody', this.state.boards.map((board, i) =>
            h('tr', [
              h('td', [
                h('a', {onClick: this.selectBoard(i)}, board.name)
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
      : ''

    return h('div', [
      h('.pure-menu.pure-menu-horizontal.pure-menu-fixed', [
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
    this.setState({sBoard: null})
  },

  selectBoard (i) {
    return () => {
      var board = this.state.boards[i]

      Promise.all([
        trello.get(`/1/boards/${board.id}/cards`, {
          filter: 'open',
          fields: 'name,pos,idList,idLabels',
          members: true,
          member_fields: 'username'
        }),
        trello.get(`/1/boards/${board.id}/labels`),
        trello.get(`/1/boards/${board.id}/lists`)
      ])
      .then(results => {
        var labelMap = {}
        results[1].forEach(label => {
          labelMap[label.id] = label
        })
        var listMap = {}
        results[2].forEach(list => {
          listMap[list.id] = list
        })

        var cards = results[0]
        cards.forEach(card => {
          card.labels = card.idLabels.map(idl => labelMap[idl])
          card.lists = card.idLabels.map(idl => listMap[idl])
        })

        this.setState({
          sBoard: {
            name: board.name,
            id: board.id,
            cards: cards.sort((a, b) => {
              if (a.list.pos === b.list.pos) {
                return b.pos - a.pos
              }
              return b.list.pos - a.list.pos
            })
          }
        })
      })
      .catch(e => console.log('selectBoard error', e.stack))
    }
  }
})

ReactDOM.render(React.createElement(App), document.body)
