"use strict";

// エレクトロン依存のモジュールの追加
const electron = require('electron');
const desktopCapturer = electron.desktopCapturer;
const remote = electron.remote;
const screen = electron.screen;
const ipc = electron.ipcRenderer;
const crypto = require('crypto');
const main = remote.require('./main.js');

const WIDTH = 800;
const HEIGHT = 450;
const SEND_INTERVAL = 1.0;
const DEFAULT_URL = 'ws://localhost:8081/';

window.URL = window.URL || window.webkitURL;

(function(){

    let selfID = generateUUID8();
    console.log(selfID);

    function init(){
        
        // 要素初期化---------------------------------------------------------------------------
        // video
        let video = document.getElementById('video');
        video.width = WIDTH;
        video.height = HEIGHT;
        let localStream;
        
        // canvas
        // 描画、送信用キャンバス
        let canvas = document.getElementById('canvas');
        let ctx = canvas.getContext("2d");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        // 範囲選択時プレビュー用キャンバス
        let sCnvs = document.getElementById('selectedcanvas');
        let sctx = sCnvs.getContext("2d");
        sCnvs.width = WIDTH;
        sCnvs.height = HEIGHT;

        // ボタン
        let num = document.getElementById('interval');
        let capButton = document.getElementById('capture');
        let setArea = document.getElementById('setarea');
        let timeReset = document.getElementById('timereset');
        let urlDest = document.getElementById('sendurl');
        let urlReset = document.getElementById('urlreset');
        
        // キャプチャー情報
        let capSource;
        let browserId = 0;
        
        let vw = screen.getPrimaryDisplay().size.width;
        let vh = screen.getPrimaryDisplay().size.height;
        
        let drawInterval;
        let drawTime ;
        let sendUrl = DEFAULT_URL;
        let selected = 0;
        let addID;

        // 範囲選択
        let areaData;
        let cw;
        let ch;
        let subX;
        let subY;

        // フラグ系
        let cap = false;
        let areaFlag = false;
        let resizeInterval = 100; //


        // 初期動作----------------------------------------------------------------------------
        initCapturing();
        //ws_connector.connect();
        
        // 起動時のキャプチャー-----------------------------------------------------------------    
        function initCapturing(){
            desktopCapturer.getSources({types: ['window', 'screen']}, 
            function(error, sources) {
                if (error) throw error;
                for (let i = 0; i < sources.length; ++i) {
                    addImage(sources[i].thumbnail);
                }
                mainViewer(sources[selected]);
                // キャプチャー情報の保持
                capSource = sources;
                // 範囲選択の情報追加
            });

            // 前回起動時の設定読み込み
            
            if(localStorage.getItem("sendInterval")){
                let t = localStorage.getItem("sendInterval");
                drawTime = t;
                num.value = t;
            } 
            else{
                drawTime = SEND_INTERVAL;
                num.value = SEND_INTERVAL;
            }
            if(localStorage.getItem("sendUrl")){
                let u = localStorage.getItem("sendUrl");
                urlDest.value = u;
                ws_connector.setURL(urlDest.value);
            }
            else{
                urlDest.value = DEFAULT_URL;
                ws_connector.setURL(urlDest.value);
            }
            
            console.log("Initialized.");
        }
        
        // sourcesに関する関数--------------------------------------------------------------------
        // bodyへのサムネイル埋め込み
        function addImage(image) {
            const elm = document.createElement("img");
            elm.id = browserId;
            browserId++;
            elm.className = "thumbnaile";
            elm.src = image.toDataURL();
            document.body.appendChild(elm);
        }

        // ボタン周り--------------------------------------------------------------------------
        // 送信インターバル変更
        num.addEventListener('change',function(eve){
            drawTime = num.value;
            localStorage.setItem("sendInterval", drawTime);
            console.log("Capture interval : " + drawTime + "sec")
        },false);

        // 送信インターバルリセット
        timeReset.addEventListener('click',function(eve){
            num.value = SEND_INTERVAL;
            drawTime = SEND_INTERVAL;
            localStorage.setItem("sendInterval", drawTime);
            console.log("Reset capture intarval.")
        }, false);

        // 送信先変更
        urlDest.addEventListener('change',function(eve){
            ws_connector.setURL(urlDest.value);
            ws_connector.close();
            ws_connector.connect();
            localStorage.setItem("sendUrl", urlDest.value); 
            console.log("URL apply :" + ws_connector.getURL());
        }, false);

        // 送信先リセット
        urlReset.addEventListener('click', function(){
            urlDest.value = DEFAULT_URL;
            ws_connector.setURL(urlDest.value);
            localStorage.setItem("sendUrl", urlDest.value);
            console.log("URL reset :" + ws_connector.getURL())
        }, false);


        // 範囲選択用イベント-------------------------------------------------------------------
        setArea.addEventListener('click', function(eve){
            areaFlag = true;
            sctx.clearRect(0, 0, WIDTH, HEIGHT);
            mainViewer(capSource[0]);
            main.areaSelector();
        }, false);
        
        ipc.on('rectData', function(event, data){
            console.log(selected);
            areaData = data;
            canvas.width = areaData.width;
            canvas.height = areaData.height;
            subX = video.videoWidth - (video.videoWidth - areaData.width);
            subY = video.videoHeight - (video.videoHeight - areaData.height);
            
            // Preview用データ
            resizeCalc(areaData);
            sctx.drawImage(video, areaData.x+8, areaData.y, subX, subY,
                                　0,            0,          cw, ch);
            sCnvs.style.display = 'inline';
            video.style.display = 'none';
            
        });

        // キャプチャーイベント-----------------------------------------------------------------
        capButton.addEventListener('click',function(eve){
            let startCapture = function () {
                // キャプチャー以外の操作の拒否
                disableI(true);
                drawInterval = setInterval(drawCall, drawTime*1000);
                cap = true;
                capButton.value = "Capture Stop";
            };
            let stopCapture = function () {
                // キャプチャー以外の操作許可
                disableI(false);
                clearInterval(drawInterval);
                cap = false;
                capButton.value = "Capture Start";
            };
            // フラグを立てる
            if(cap === false){
                if (!ws_connector.isConnected()) {
                    ws_connector.connect(function () {
                        this();
                    }.bind(startCapture), function () {
                        // 繋がらないか切断された
                        window.alert("ChOWDERに接続できませんでした");
                        this();
                    }.bind(stopCapture));
                    return;
                } else {
                    startCapture();
                }
            }
            // フラグを下ろす
            else if(cap === true){
                stopCapture();
            }
        }, false);

        // キャプチャー中の入力系一括disabled関数
        function disableI(bool){
            setArea.disabled = bool;
            num.disabled = bool;
            timeReset.disabled = bool;
            urlDest.disabled = bool;
            urlReset.disabled = bool;
        }

        // 同期描画、送信イベント----------------------------------------------------------------
        // Canvasをバイナリ変換後送信
        function sendImage(getCanvas){
            ws_connector.sendBinary('AddContent', {
                "id" :         selfID,  // 起動時、特定のID に固定する.
                "content_id" : selfID,  // 特定のID に固定する.
                "type" :       "image"
            },getImageBinary(getCanvas), function(){});
    
        }

        function onResize(){
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            
            setInterval(function () {
                if( canvas.height !== video.videoHeight || canvas.width !== video.videoWidth ){
                    canvas.height = video.videoHeight;
                    canvas.width = video.videoHeight;
                }
            }, resizeInterval);
        }

        // 描画呼び出し
        function drawCall(){
            // 範囲選択時
            if(areaFlag === true){
                console.log("Area captured.");
                sctx.clearRect(0, 0, WIDTH, HEIGHT)
                sctx.drawImage(video, areaData.x+8, areaData.y, subX, subY,
                                　0, 0, cw, ch);
                canvas.width = areaData.width;
                canvas.height = areaData.height;
                console.log();
                ctx.drawImage(video, areaData.x+8, areaData.y, 
                                     subX, subY,
                                     0, 0, areaData.width, areaData.height);
                sendImage(canvas);
            }
            // 非範囲選択時
            else if(areaFlag === false){
                console.log("Select captured.");
                console.log(video.videoWidth, video.videoHeight);
                onResize();
                ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                sendImage(canvas);
            }
        }
        
        // キャプチャー対象の切り替え-------------------------------------------------------------
        addEventListener('click', function(eve){
            let id = eve.target.id;
            let cs = eve.target.className;
            if(cs === 'thumbnaile' && id){
                if(areaFlag) {
                    areaFlag = false;
                    sCnvs.style.display = 'none';
                    video.style.display = 'inline';
                }
                selected = id;
                mainViewer(capSource[selected]);
            }
        }, false);

        // viewer-------------------------------------------------------------------------------
        function mainViewer(source){
            let media;
            if (source.name == "Entire screen") {
                media = 'screen';
            }
            else {
                media = 'desktop';
            }
            navigator.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: media,
                        chromeMediaSourceId: source.id, 
                        minWidth: 0,
                        maxWidth: vw,
                        minHeight: 0,
                        maxHeight: vh
                    }
                }
            }, gotStream, getUserMediaError);
        }

        // デスクトップ情報の取得が成功したとき
        function gotStream(stream) {
            if(localStream) URL.revokeObjectURL(localStream);
            localStream = stream;
            document.querySelector('video').src = URL.createObjectURL(localStream);
            // windowを手前する
            document.querySelector('video').oncanplay = function () {
                if(areaFlag !== true) main.activeW();
            }
        }

        // デスクトップ情報の取得に失敗したとき
        function getUserMediaError(e) {
            console.log('getUserMediaError');
        }
        
        // バイナリデータへ変換
        function getImageBinary(canvas) {
            var base64 = canvas.toDataURL('image/png');
            // Base64からバイナリへ変換
            var bin = atob(base64.replace(/^.*,/, ''));
            var array = new ArrayBuffer(bin.length);
            var buffer = new Uint8Array(array);
            for (var i = 0; i < bin.length; i++) {
                buffer[i] = bin.charCodeAt(i);
            }
            // Blobを作成
            return array;
        }

        // 範囲選択時プレビュー作成用
        function resizeCalc(nData){
            let aspect = nData.width/nData.height;
            console.log("aspect :" + aspect);
            let ratio;
            
            if(aspect>=1)   ratio = WIDTH/nData.width;
            else if(aspect<1) ratio = HEIGHT/nData.height;
            
            cw = Math.round(nData.width * ratio);
            ch = Math.round(nData.height * ratio);

            // リサイズ後も条件に満たなかった場合
            if(ch>HEIGHT && aspect>=1){
                ratio = HEIGHT/ch;
                cw = Math.round(cw * ratio);
                ch = Math.round(ch * ratio);
            }
            else if(cw>WIDTH && aspect<1){
                ratio = WIDTH/cw;
                cw = Math.round(cw * ratio);
                ch = Math.round(ch * ratio);
            }
            console.log(cw, ch);
        }

    };
    /**
     * 指定されたバイト列からUUID生成
     * @method uuidFromBytes
     * @param {Bytes} rnd バイト列
     * @return {String} UUID UUID
     */
    function uuidFromBytes(rnd) {
        "use strict";
        rnd[6] = (rnd[6] & 0x0f) | 0x40;
        rnd[8] = (rnd[8] & 0x3f) | 0x80;
        rnd = rnd.toString('hex').match(/(.{8})(.{4})(.{4})(.{4})(.{12})/);
        rnd.shift();
        return rnd.join('-');
    }

    /**
     * UUID生成。callbackの指定が存在しない場合は無作為な乱数列から生成
     * @method generateUUID
     * @param {Function} callback 暗号化する場合に指定するコールバック関数
     */
    function generateUUID(callback) {
        "use strict";
        if (typeof (callback) !== 'function') {
            return uuidFromBytes(crypto.randomBytes(16));
        }
        crypto.randomBytes(16, function (err, rnd) {
            if (err) { return callback(err); }
            callback(null, uuidFromBytes(rnd));
        });
    }

    /**
     * 8ケタのUUID生成
     * @method generateUUID8
     * @return {String} UUID 8ケタのUUID
     */
    function generateUUID8() {
        'use strict';
        return generateUUID().slice(0, 8);
    }

    window.onload = init;

})();