//@flow
import React, { Component } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';

import { Chess } from 'chess.js';
import Share from 'react-native-share';
import Sound from 'react-native-sound';

import { Button, Board, Clock } from '../../components';

const HTTP_BASE_URL = 'https://en.lichess.org';
const SOCKET_BASE_URL = 'wss://socket.lichess.org';
const URL_SCHEME = 'lichess599://';
const dongSound = new Sound('dong.mp3', Sound.MAIN_BUNDLE);

export default class PlayerVsFriend extends Component {
  static navigationOptions = {
    title: 'Play with a friend'
  };

  constructor(props) {
    super(props);

    const { time } = this.props.navigation.state.params;
    this.clientId = Math.random()
      .toString(36)
      .substring(2);

    this.state = {
      initialized: false,
      invitationId: '',
      game: new Chess(),
      gameStarted: false,
      userColor: '',
      whiteClock: time,
      blackClock: time,
      victor: '',
      resigned: false
    };
  }

  componentDidMount() {
    const params = this.props.navigation.state.params || {};
    const { gameId, playConfig } = params;

    if (gameId) {
      this.joinGame(gameId);
    } else {
      this.createGame(playConfig);
    }
  }

  componentWillUnmount() {
    clearInterval(this.interval);
    this.gameSocketUrl = null;
    this.ws = null;
  }

  resign = () => {
    this.sendMessage({ t: 'resign' });
    this.setState({ resigned: true });
  };

  createGame(playConfig) {
    fetch(`${HTTP_BASE_URL}/setup/friend`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.lichess.v2+json',
        'Content-Type': 'application/json'
      },
      body: playConfig
    })
      .then((res) => res.json())
      .then((res) => {
        const gameId = res.challenge.id;
        const socketUrl = `${SOCKET_BASE_URL}/challenge/${gameId}/socket/v2?sri=${this
          .clientId}&mobile=1`;
        this.createSocket(socketUrl, gameId);
        this.setState({
          initialized: true,
          invitationId: gameId,
          userColor: res.challenge.color === 'white' ? 'w' : 'b'
        });
      });
  }

  joinGame(gameId) {
    fetch(`${HTTP_BASE_URL}/challenge/${gameId}/accept`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.lichess.v2+json',
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.error) {
          alert(res.error);
        } else {
          const socketUrl = `${SOCKET_BASE_URL}${res.url.socket}?sri=${this
            .clientId}&mobile=1`;
          this.createSocket(socketUrl);
          this.setState({
            initialized: true,
            gameStarted: true,
            userColor: res.player.color === 'white' ? 'w' : 'b'
          });
        }
      });
  }

  retrieveSocketUrl(socketId) {
    fetch(`${HTTP_BASE_URL}/challenge/${socketId}`).then(() => {
      fetch(`${HTTP_BASE_URL}/${socketId}`, {
        headers: {
          Accept: 'application/vnd.lichess.v2+json',
          'Content-Type': 'application/json'
        }
      })
        .then((res) => res.json())
        .then((res) => {
          this.gameFetching = false;
          if (res.url && res.url.socket) {
            this.gameFetched = true;
            dongSound.play();

            const socketUrl = `${SOCKET_BASE_URL}${res.url.socket}?sri=${this
              .clientId}&mobile=1`;
            this.gameSocketUrl = socketUrl;
            this.createSocket(socketUrl);

            this.setState({
              gameStarted: true,
              userColor: res.player.color === 'white' ? 'w' : 'b'
            });
          }
        });
    });
  }

  createSocket = (socketUrl, socketId) => {
    console.log('socket: ' + socketUrl);
    const { game } = this.state;

    this.wsReady = false;
    this.ws = new WebSocket(socketUrl);
    clearInterval(this.interval);

    this.ws.onmessage = (e) => {
      // a message was received
      console.log(`received: ${e.data}`);
      const data = JSON.parse(e.data);

      if (
        data.t === 'reload' &&
        data.v > 1 &&
        !this.gameFetched &&
        !this.gameFetching
      ) {
        // this sets cookie
        this.gameFetching = true;
        this.retrieveSocketUrl(socketId);
      }

      let moveData;
      let victor;
      if (data.t === 'move') {
        moveData = data.d;
      } else if (data.t === 'end') {
        victor = data.d;
      } else if (data.t === 'b') {
        const first = data.d[0];
        if (first) {
          if (first.d.status && first.d.status.name === 'mate') {
            moveData = first.d;
          }
          if (first.t === 'end') {
            victor = first.d;
          }
          if (first.d.winner) {
            victor = first.d.winner;
          }
        }
      }

      if (victor) {
        dongSound.play();
        this.setState({
          victor
        });
        this.ws = null;
      } else if (moveData) {
        // opponent move
        if (data.v > game.history().length) {
          const uci = moveData.uci;
          const castle = moveData.castle;
          let from = uci.substring(0, 2);
          let to = uci.substring(2, 4);

          if (castle && castle.king) {
            from = castle.king[0];
            to = castle.king[1];
          }

          this.board.movePiece(to, from);
        }

        const clock = moveData.clock || {};
        this.setState({
          whiteClock: clock.white || -1,
          blackClock: clock.black || -1
        });
      }
    };

    this.ws.onerror = (e) => {
      // an error occurred
      console.log(e.message);
    };

    this.ws.onclose = (e) => {
      console.log(e.code, e.reason);
      if (this.gameSocketUrl) {
        this.createSocket(this.gameSocketUrl);
      }
    };

    this.ws.onopen = () => {
      console.log('ws open');
      this.wsReady = true;
      // ping every second
      clearInterval(this.interval);
      this.interval = setInterval(() => {
        this.sendMessage({
          t: 'p',
          v: game.history().length
        });
      }, 1000);
    };
  };

  sendMessage(obj) {
    if (this.wsReady && this.ws) {
      const str = JSON.stringify(obj);
      console.log(`${this.interval} sending: ${str}`);
      this.ws.send(str);
    }
  }

  onMove = ({ from, to }) => {
    const { game, userColor } = this.state;
    game.move({
      from,
      to
    });

    if (game.turn() !== userColor) {
      this.sendMessage({
        t: 'move',
        d: {
          from,
          to
        }
      });
    }
  };

  shouldSelectPiece = (piece) => {
    const { game, userColor, victor } = this.state;
    const turn = game.turn();
    if (
      !this.wsReady ||
      victor ||
      game.in_checkmate() === true ||
      game.in_draw() === true ||
      turn !== userColor ||
      piece.color !== userColor
    ) {
      return false;
    }
    return true;
  };

  share = () => {
    const { invitationId } = this.state;
    Share.open({
      title: "Let's play chess",
      url: `${URL_SCHEME}${invitationId}`
    });
  };

  renderVictorText() {
    const { victor } = this.state;

    if (victor) {
      return (
        <Text style={styles.statusText}>
          Game over, {victor} is victorious!
        </Text>
      );
    }
    return null;
  }

  renderInvitationMessage() {
    const { invitationId, gameStarted } = this.state;
    if (invitationId && !gameStarted) {
      return (
        <View style={styles.fullScreen}>
          <View style={styles.invitationBox}>
            <Text style={[styles.text, styles.headline]}>
              Waiting for a friend!
            </Text>
            <Text style={styles.text}>
              To invite someone to play, give this URL
            </Text>
            <Text style={[styles.text, styles.urlText]}>
              {`${URL_SCHEME}${invitationId}`}
            </Text>
            <Text style={styles.text}>
              The first person to come to this URL will play with you.
            </Text>
            <Button text={'Share game URL'} onPress={this.share} />
          </View>
        </View>
      );
    }
  }

  render() {
    const {
      game,
      initialized,
      fen,
      userColor,
      whiteClock,
      blackClock,
      victor,
      resigned,
      gameStarted
    } = this.state;
    const isReverseBoard = userColor === 'b';
    const turn = game.turn();
    const historyLength = game.history().length;
    const whiteTurn = historyLength > 0 && turn === 'w' && !victor;
    const blackTurn = historyLength > 1 && turn === 'b' && !victor;

    if (!initialized) {
      return <ActivityIndicator style={styles.container} animating />;
    }

    return (
      <View style={styles.container}>
        <Clock
          time={isReverseBoard ? whiteClock : blackClock}
          enabled={isReverseBoard ? whiteTurn : blackTurn}
        />
        <Board
          ref={(board) => (this.board = board)}
          fen={fen}
          color={userColor}
          shouldSelectPiece={this.shouldSelectPiece}
          onMove={this.onMove}
        />
        {this.renderVictorText()}
        <Clock
          time={isReverseBoard ? blackClock : whiteClock}
          enabled={isReverseBoard ? blackTurn : whiteTurn}
        />
        {!resigned &&
          gameStarted &&
          !victor && (
            <Button
              style={styles.resignButton}
              text={resigned ? 'Resigned' : 'Resign'}
              onPress={this.resign}
            />
          )}
        {this.renderInvitationMessage()}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'black'
  },
  fullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  invitationBox: {
    backgroundColor: 'white',
    padding: 16
  },
  text: {
    fontSize: 12,
    marginVertical: 8,
    textAlign: 'center'
  },
  urlText: {
    backgroundColor: 'grey',
    paddingVertical: 16,
    color: 'white'
  },
  headline: {
    fontSize: 16,
    fontWeight: 'bold',
    margin: 0
  },
  statusText: {
    color: 'red',
    fontSize: 16,
    margin: 4
  },
  resignButton: {
    width: 200,
    backgroundColor: 'red'
  }
});
