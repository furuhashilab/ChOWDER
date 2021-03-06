/*jslint node:true, devel: true, nomen: true, indent: 4, maxerr: 100 */
/*global io, require */

(function () {
	"use strict";
	var IOConnector =  function () {},
		metabinary = require('./metabinary.js'),
		Command = require('./command.js'),
		util = require('./util.js'),
		resultCallbacks = {},
		recievers = {},
		messageID = 1;

	function sendResponse(socket, injson) {
		return function (err, res, binary) {
			var metabin = null,
				result;
			//console.log("isBinary", binary);
			if (binary !== undefined && binary !== null) {
				result = {
					jsonrpc: "2.0",
					id: injson.id,
					method : injson.method,
					result : res
				};
				metabin = metabinary.createMetaBinary(result, binary);
				if (metabin === null || metabin === undefined) {
					result.error = 'Failed to create Metabinary';
					console.log('Failed to create Metabinary');
					socket.emit("chowder_response", JSON.stringify(result));
				} else {
					socket.emit("chowder_response", metabin);
				}
			} else {
				result = {
					jsonrpc: "2.0",
					id: injson.id,
					method : injson.method
				};
				if (err) {
					result.error = err;
				}
				result.result = res;
				console.log("chowder_response", result.method);
				socket.emit("chowder_response", JSON.stringify(result));
			}
		};
	}

	/**
	 * テキストメッセージの処理.
	 * @method eventTextMessage
	 * @param {Object} socket socket
	 * @param {JSON} metaData メタデータ
	 */
	function eventTextMessage(socket, metaData) {
		if (metaData.to === "client") {
			// masterからclientに送ったメッセージが返ってきた.
			if (metaData.error) {
				if (resultCallbacks.hasOwnProperty(metaData.id)) {
					resultCallbacks[metaData.id](metaData.error, null);
				}
			} else if (metaData.hasOwnProperty('id') && metaData.hasOwnProperty('result')) {
				resultCallbacks[metaData.id](null, metaData.result);
			} else {
				console.error('[Error] ArgumentError in connector.js');
				if (metaData.hasOwnProperty('id')) {
					resultCallbacks[metaData.id]('ArgumentError', null);
				}
			}
		} else {
			// clientからmasterにメッセージが来た
			if (recievers.hasOwnProperty(metaData.method)) {
				recievers[metaData.method](metaData.params, (function (socket) {
					return sendResponse(socket, metaData);
				}(socket)), socket.id);
			}
		}
	}
	
	/**
	 * バイナリメッセージの処理.
	 * @method eventBinaryMessage
	 * @param {Object} socket socket
	 * @param {JSON} metaData メタデータ
	 * @param {Blob} contentData コンテンツバイナリ
	 */
	function eventBinaryMessage(socket, metaData, contentData) {
		var data = {
			metaData : metaData.params,
			contentData : contentData
		};
		if (metaData.to === "client") {
			// masterからclientに送ったメッセージが返ってきた.
			if (metaData.error) {
				if (resultCallbacks[metaData.id]) {
					resultCallbacks[metaData.id](metaData.error, null);
				}
			} else if (metaData.id && contentData) {
				if (resultCallbacks[metaData.id]) {
					resultCallbacks[metaData.id](null, data);
				}
			} else {
				console.error('[Error] ArgumentError in connector.js');
				if (metaData.id && resultCallbacks[metaData.id]) {
					resultCallbacks[metaData.id]('ArgumentError', null);
				}
			}
		} else {
			// clientからmasterにメッセージが来た
			if (recievers.hasOwnProperty(metaData.method)) {
				// onで登録していたrecieverを呼び出し
				// 完了後のコールバックでclientにメッセージを返す.
				recievers[metaData.method](data, (function (socket) {
					return sendResponse(socket, metaData);
				}(socket)), socket.id);
			}
		}
	}
	
	/**
	 * イベントを登録する
	 * @method registerEvent
	 * @param {Object} io ソケットIO
	 * @param {Object} socket socket
	 */
	function registerEvent(io, socket) {
		socket.on("chowder_request", function (data) {
			console.log("chowder_request : ", data);
			var parsed,
				result;
			
			if (typeof data === "string") {
				try {
					parsed = JSON.parse(data);
					// JSONRPCのidがなかった場合は適当なidを割り当てておく.
					if (!parsed.hasOwnProperty('id')) {
						parsed.id = util.generateUUID8();
					}
					eventTextMessage(socket, parsed);
				} catch (e) {
					console.error("failed to parse json : ", e);
				}
			} else {
				//console.log("load meta binary", data);
				metabinary.loadMetaBinary(data, function (metaData, contentData) {
					// JSONRPCのidがなかった場合は適当なidを割り当てておく.
					if (!metaData.hasOwnProperty('id')) {
						metaData.id = util.generateUUID8();
					}
					eventBinaryMessage(socket, metaData, contentData);
				});
			}
		});
	}
	
	function sendWrapper(socket, id, method, reqdata, resultCallback) {
		if (Command.hasOwnProperty(method)) {
			resultCallbacks[id] = resultCallback;

			console.log('[Info] chowder_response', reqdata);
			//console.log("chowder_response sendWrapper");
			socket.emit('chowder_response', reqdata);

		} else {
			console.log('[Error] Not found the method in connector: ', method);
		}
	}
	
	/**
	 * テキストメッセージをclientへ送信する
	 * @method send
	 * @oaram {Object} socket socket
	 * @param {String} method メソッド JSONRPCメソッド
	 * @param {JSON} args パラメータ
	 * @param {Function} resultCallback サーバから返信があった場合に呼ばれる. resultCallback(err, res)の形式.
	 */
	function send(socket, method, args, resultCallback) {
		var reqjson = {
			jsonrpc: '2.0',
			type : 'utf8',
			id: messageID,
			method: method,
			params: args,
			to: 'client'
		}, data;
		
		messageID = messageID + 1;
		try {
			data = JSON.stringify(reqjson);
			sendWrapper(socket, reqjson.id, reqjson.method, data, resultCallback);
		} catch (e) {
			console.error(e);
		}
	}
	
	/**
	 * バイナリメッセージをclientへ送信する
	 * @method sendBinary
	 * @oaram {Object} socket socket
	 * @param {String} method メソッド JSONRPCメソッド
	 * @param {ArrayBuffer} binary バイナリデータ
	 * @param {JSON} args パラメータ
	 * @param {Function} resultCallback サーバから返信があった場合に呼ばれる. resultCallback(err, res)の形式.
	 */
	function sendBinary(socket, method, binary, resultCallback) {
		var data = {
			jsonrpc: '2.0',
			type : 'binary',
			id: messageID,
			method: method,
			params: binary,
			to: 'client'
		};
		
		messageID = messageID + 1;
		
		try {
			sendWrapper(socket, data.id, data.method, data, resultCallback);
		} catch (e) {
			console.error(e);
		}
	}
	
	/**
	 * コールバックの登録.
	 * @method on
	 * @param {String} method JSONRPCメソッド
	 * @param {Function} callback サーバからメッセージを受け取った場合に呼ばれる. callback(err, res)の形式.
	 */
	function on(method, callback) {
		recievers[method] = callback;
	}
	
	/**
	 * ブロードキャストする.
	 * @method broadcast
	 * @param {Object} io socket.ioオブジェクト
	 * @param {String} method JSONRPCメソッド
	 * @param {JSON} args パラメータ
	 * @param {Function} resultCallback サーバから返信があった場合に呼ばれる. resultCallback(err, res)の形式.
	 */
	function broadcast(io, method, args, resultCallback) {
		var reqjson = {
			jsonrpc: '2.0',
			type : 'utf8',
			id: messageID,
			method: method,
			params: args,
			to: 'client'
		}, data;
		
		messageID = messageID + 1;
		try {
			data = JSON.stringify(reqjson);
			if(method !== 'UpdateMouseCursor'){console.log("chowder_response broadcast io", method);}
			for (var i = 0; i < io.length; ++i) {
				io[i].emit('chowder_response', data);
			}
		} catch (e) {
			console.error(e);
		}
	}
	
	IOConnector.prototype.registerEvent = registerEvent;
	IOConnector.prototype.on = on;
	IOConnector.prototype.send = send;
	IOConnector.prototype.sendBinary = sendBinary;
	IOConnector.prototype.broadcast = broadcast;
	module.exports = new IOConnector();
}());
