var conf = {iceServers: [{urls: []}]};
var pc = new RTCPeerConnection(conf);
var localStream, _fileChannel, chatEnabled,context,source,
	_chatChannel,sendFileDom = {}, 
	recFileDom={},receiveBuffer=[],
	receivedSize=0,
	file,
	bytesPrev=0; 
function errHandler(err){
	console.log(err);
}
function enableChat(){
	enable_chat.checked? (chatEnabled=true) : (chatEnabled=false);
}
enableChat();

navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(stream=>{
	localStream = stream;
	micused.innerHTML = localStream.getAudioTracks()[0].label;
	pc.addStream(stream);
	local.src = URL.createObjectURL(stream);
	local.muted=true;
}).catch(errHandler);

function sendMsg(){
	var text = sendTxt.value;
	chat.innerHTML = chat.innerHTML + "<pre class=sent>" + text + "</pre>";
	_chatChannel.send(text);
	sendTxt.value="";
	return false;
}
pc.ondatachannel = function(e){
	if(e.channel.label == "fileChannel"){
		console.log('fileChannel Received -',e);
		_fileChannel = e.channel;
		fileChannel(e.channel);
	}
	if(e.channel.label == "chatChannel"){
		console.log('chatChannel Received -',e);
		_chatChannel = e.channel;
		chatChannel(e.channel);
	}
};

pc.onicecandidate = function(e){
	var cand = e.candidate;
	if(!cand){
		console.log('iceGatheringState complete',pc.localDescription.sdp);
		localOffer.value = JSON.stringify(pc.localDescription);
	}else{
		console.log(cand.candidate);
	}
}
pc.oniceconnectionstatechange = function(){
	console.log('iceconnectionstatechange: ',pc.iceConnectionState);
}
pc.onaddstream = function(e){
	console.log('remote onaddstream',e.stream);
	remote.src = URL.createObjectURL(e.stream);
}
pc.onconnection = function(e){
	console.log('onconnection ',e);
}

remoteOfferGot.onclick = function(){
	var _remoteOffer = new RTCSessionDescription(JSON.parse(remoteOffer.value));
	console.log('remoteOffer \n',_remoteOffer);
	pc.setRemoteDescription(_remoteOffer).then(function() {
			console.log('setRemoteDescription ok');
			if(_remoteOffer.type == "offer"){
		        pc.createAnswer().then(function(description){
		        	console.log('createAnswer 200 ok \n',description);
				    pc.setLocalDescription(description).then(function() {
				    }).catch(errHandler);	            	
		        }).catch(errHandler);				
			}
	}).catch(errHandler);	
}
localOfferSet.onclick = function(){
	if(chatEnabled){
		_chatChannel = pc.createDataChannel('chatChannel');
		_fileChannel = pc.createDataChannel('fileChannel');
		// _fileChannel.binaryType = 'arraybuffer';
		chatChannel(_chatChannel);
		fileChannel(_fileChannel);
	}
	pc.createOffer().then(des=>{
		console.log('createOffer ok ');
		pc.setLocalDescription(des).then( ()=>{
			setTimeout(function(){
				if(pc.iceGatheringState == "complete"){
					return;
				}else{
					console.log('after GetherTimeout');
					localOffer.value = JSON.stringify(pc.localDescription);
				}
			},2000);
			console.log('setLocalDescription ok');
		}).catch(errHandler);
		// For chat
	}).catch(errHandler);
}

//File transfer
fileTransfer.onchange = function(e){
	var files = fileTransfer.files;
	if(files.length > 0){
		file=files[0];
		sendFileDom.name=file.name;
		sendFileDom.size=file.size;
		sendFileDom.type=file.type;
		sendFileDom.fileInfo="areYouReady";
		console.log(sendFileDom);	
	}else{
		console.log('No file selected');
	}
}
function sendFile(){
	if(!fileTransfer.value)return;
	var fileInfo = JSON.stringify(sendFileDom);
	_fileChannel.send(fileInfo);
	console.log('file info sent');
}


function fileChannel(e){
	_fileChannel.onopen = function(e){
		console.log('file channel is open',e);
	}
	_fileChannel.onmessage = function(e){
		// Figure out data type
		var type = Object.prototype.toString.call(e.data),data;
		if(type == "[object ArrayBuffer]"){
			data = e.data;
			receiveBuffer.push(data);
			receivedSize += data.byteLength;
			recFileProg.value = receivedSize;
			if(receivedSize == recFileDom.size){
				var received = new window.Blob(receiveBuffer);
				file_download.href=URL.createObjectURL(received);
				file_download.innerHTML="download";
				file_download.download = recFileDom.name;
				// rest
				receiveBuffer = [];
				receivedSize = 0;
				// clearInterval(window.timer);	
			}
		}else if(type == "[object String]"){
			data = JSON.parse(e.data);
		}else if(type == "[object Blob]"){
			data = e.data;
			file_download.href=URL.createObjectURL(data);
			file_download.innerHTML="download";
			file_download.download = recFileDom.name;
		}

		// Handle initial msg exchange
		if(data.fileInfo){
			if(data.fileInfo == "areYouReady"){
				recFileDom = data;
				recFileProg.max=data.size;
				var sendData = JSON.stringify({fileInfo:"readyToReceive"});
				_fileChannel.send(sendData);
				// window.timer = setInterval(function(){
				// 	Stats();
				// },1000)				
			}else if(data.fileInfo == "readyToReceive"){
				sendFileProg.max = sendFileDom.size;
				sendFileinChannel(); // Start sending the file
			}
			console.log('_fileChannel: ',data.fileInfo);
		}	
	}
	_fileChannel.onclose = function(){
		console.log('file channel closed');
	}
}

function chatChannel(e){
	_chatChannel.onopen = function(e){
		console.log('chat channel is open',e);
	}
	_chatChannel.onmessage = function(e){
		chat.innerHTML = chat.innerHTML + "<pre>"+ e.data + "</pre>"
	}
	_chatChannel.onclose = function(){
		console.log('chat channel closed');
	}
}

function sendFileinChannel(){
  var chunkSize = 16384;
  var sliceFile = function(offset) {
    var reader = new window.FileReader();
    reader.onload = (function() {
      return function(e) {
        _fileChannel.send(e.target.result);
        if (file.size > offset + e.target.result.byteLength) {
          window.setTimeout(sliceFile, 0, offset + chunkSize);
        }
        sendFileProg.value= offset + e.target.result.byteLength
      };
    })(file);
    var slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  };
  sliceFile(0);
}

function Stats(){
	pc.getStats(null,function(stats){
    for (var key in stats) {
      var res = stats[key];
      console.log(res.type,res.googActiveConnection);
      if (res.type === 'googCandidatePair' &&
          res.googActiveConnection === 'true') {
        // calculate current bitrate
        var bytesNow = res.bytesReceived;
        console.log('bit rate', (bytesNow - bytesPrev));
        bytesPrev = bytesNow;
      }
    }
	});
}

streamAudioFile.onchange = function(){
	console.log('streamAudioFile');
	context = new AudioContext();
  var file = streamAudioFile.files[0];
  if (file) {
    if (file.type.match('audio*')) {
      var reader = new FileReader();
        reader.onload = (function(readEvent) {
          context.decodeAudioData(readEvent.target.result, function(buffer) {
            // create an audio source and connect it to the file buffer
            source = context.createBufferSource();
            source.buffer = buffer;
            source.start(0);
 
            // connect the audio stream to the audio hardware
            source.connect(context.destination);
 
            // create a destination for the remote browser
            var remote = context.createMediaStreamDestination();
 
            // connect the remote destination to the source
            source.connect(remote);
 
			 			local.srcObject = remote.stream
						local.muted=true;
            // add the stream to the peer connection
            pc.addStream(remote.stream);
 
            // create a SDP offer for the new stream
            // pc.createOffer(setLocalAndSendMessage);
          });
        });
 
      reader.readAsArrayBuffer(file);
    }
  }	
}

var audioRTC = function (cb){
  console.log('streamAudioFile');
  window.context = new AudioContext();
  var file = streamAudioFile.files[0];
  if (file) {
    if (file.type.match('audio*')) {
      var reader = new FileReader();
        reader.onload = (function(readEvent) {
          context.decodeAudioData(readEvent.target.result, function(buffer) {
            // create an audio source and connect it to the file buffer
            var source = context.createBufferSource();
            source.buffer = buffer;
            source.start(0);
  
            // connect the audio stream to the audio hardware
            source.connect(context.destination);
 
            // create a destination for the remote browser
            var remote = context.createMediaStreamDestination();
 
            // connect the remote destination to the source
            source.connect(remote);
            window.localStream = remote.stream;
            cb({'status':'success','stream':true});
          });
        });
 
      reader.readAsArrayBuffer(file);
    }
  } 
}
