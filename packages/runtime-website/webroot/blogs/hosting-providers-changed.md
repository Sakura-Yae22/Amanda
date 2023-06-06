# Customer service is key
Ever since mid 2021, Amanda, Tsukiko and some other community bots I hosted has been hosted on great VMs provided by Contabo. Their stats were 4 vCores and 8GB of ram with 200GB SSDs and the performance of the machines has been awesome for the price. Amanda came from Vultr and OVH where their VMs were a little more underpowered for the same price (about 6 eur/m).

If I'm saying their VMs are great, then why is the title suggesting otherwise?
Well, I'm glad you probably asked that in your mind before reading that last sentence. If not, well then it's probably not coming as a surprise, but Contabo's customer service has been terrible. This year, not even 3 months in, Amanda has had 2 major outages lasting for many hours (9 hours as of writing this). This is very unacceptable and the fact that the hosting provider's web panel was saying things were fine means SOMETHING happened. I'll spoil the result and say that nothing was wrong on my end and nothing insane like massive internet traffic backbone failure was occuring. Even VMs from the same datacenter I owned worked fine.

6 hours after I created a ticket, I got a response, but it wasn't that they looked at it; It was support requesting VPS login details to forward to tech when they get to it for which there are none other than port and username as I exclusively use public key based login. No response since, but the VPS is back up so either it fixed itself or they did something and haven't informed me yet. Earlier this year, the same thing happened and once they emailed me back, they said they found it running fine and that the host machine had no issues and also if something like this happens again, I should give them login details. I told them it was only public key based login and they responded pretty quickly afterwards saying that they'll need to provide me with their public key to add to the authorized_keys file and they never did.

## Where do we go from here?
So, I knew I just needed to wait out this storm no matter how painful it was and figure out what to do, which leads me to today. Today, I am cancelling all of my VPS' from Contabo and writing this today saying that I used Contabo so that you all don't have to. Amanda is moving hosting providers to GalaxyGate. I have already successfully migrated all of Amanda and Tsukiko to the new node. I called it Willow after the weeping willow tree as I have been calling Amanda's VPS' after trees. The first 3 were Maple, Mahogany and Sakura. Those are being permanently retired.

Amanda beta will not follow onto Willow and may also be permanently retired, but I'm not sure yet. It's WAY too expensive for me to purchase another VPS from GalaxyGate to justify keeping Amanda beta up. Some other bots and servers like Minecraft that I host for communities I'm apart of will also be turned off for the time being as the new VPS isn't capable of supporting everything I throw at it despite how much optimization I've done to Amanda. One instance being Nadeko. Even just being in 1 50k member server (Mum's House), ram usage is absurdly high as if this was the day of Amanda using Discord.js v11 on Discord gateway v6 where presences ate more memory than her host machine could handle until it crashed from OOM.

## Conclusions / takeaways
Do not use Contabo for uptime sensitive applications. The price for what they offer is amazing, but the accidents that have happened with lack luster support turned me off. Amanda's back to monching a steady supply of ram and will be for the forseeable future. (hopefully. GalaxyGate had a lot of recommendations from people I questioned and they offer an unmetered connection)

![Amanda, a red haired cat girl moching on a stick of ram](https://cdn.discordapp.com/emojis/664057401682558995.webp)