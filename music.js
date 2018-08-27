const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(API_KEY);

const queue = new Map();

client.login(process.env.TOKEN);

client.on('ready', () => console.log('[Sonico]: Senpai! I\'m ready !'));

client.on('message', async msg => {
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send(':worried: Je suis désolée mais vous devez être dans un salon, pour obtenir de la musique.');
		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id);
				await handleVideo(video2, msg, voiceChannel, true);
			}
			return msg.channel.send(`:white_check_mark: Playlist: **${playlist.title}** has been added to the queue!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Liste des musiques possibles**__ :
${videos.map(video2 => `**${++index} )** ${video2.title}`).join('\n')}

Veuillez entrer un chiffre entre 1 et 10, pour sélectionner l'un des résultats.
:warning: Vous avez très peu de temps pour choisir, alors dépêchez-vous !
					`);
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send(':persevere: Temps écoulé ! Je me dois d\'annuler la demande.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send(':sos: Désolée, je n\'ai pu obtenir aucun résultat de recherche.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send(':confused: Désolée, mais vous n\'êtes pas dans un salon.');
		if (!serverQueue) return msg.channel.send(':confounded: Il n\'y a aucune musique en cours que je puisse sauter pour vous.');
		return msg.channel.send(':track_next: Musique sautée pour vous !');
		serverQueue.connection.dispatcher.end('Skip Command has been used!');
		return undefined;
	} else if (command === 'stop') {
		if (!msg.member.voiceChannel) return msg.channel.send(':confused: Désolée, mais vous n\'êtes pas dans un salon.');
		if (!serverQueue) return msg.channel.send(':confounded: Il n\'y a aucune musique en cours que je puisse arrêter pour vous.');
		return msg.channel.send(':stop_button: Musique arrêtée pour vous !');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Stop Command has been used!');
		return undefined;
	} else if (command === 'volume') {
		if (!msg.member.voiceChannel) return msg.channel.send(':confused: Désolée, mais vous n\'êtes pas dans un salon');
		if (!serverQueue) return msg.channel.send(':confused: Il n\'y a aucune musique en cours.');
		if (!args[1]) return msg.channel.send(`:sound: Le volume actuel est de **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`:sound: Je mets le volume à **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send(':confused: Il n\'y a aucune musique en cours.');
		return msg.channel.send(`🎶 Lecture en cours : **${serverQueue.songs[0].title}**`);
	} else if (command === 'queue') {
		if (!serverQueue) return msg.channel.send(':confused: Il n\'y a aucune musique en cours.');
		return msg.channel.send(`
__**File d'attente des musiques**__ :
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Lecture en cours:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send(':pause_button: Musique en pause pour vous !');
		}
		return msg.channel.send(':confused: Il n\'y a aucune musique en cours.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send(':arrow_forward: Musique en marche pour vous !');
		}
		return msg.channel.send(':confused: Il n\'y a aucune musique en cours.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`I could not join the voice channel: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`:pensive: Désolée, je ne pouvais pas rejoindre le salon. ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`:white_check_mark: **${song.title}** est en attente !`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`:notes: Lecture : **${song.title}**`);
}
