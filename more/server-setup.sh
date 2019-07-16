
### RESOLVE rpool volume tagging mismatch ###

zpool status # see the device is c4t0d0
sudo format # see the device is c1t0d0. This is mismatched
^C # Ctrl+C
# beadm activate will fail and significant pkg updates resulting in "Create boot environment: Yes" will not be possible

# this is fixed with instructions from https://omniosce.org/ml-archive/2018-July/009651.html
# the issue is that the zpool thinks its c4, but as you can see in sudo format, it's coming out as c1
# • First create additional Volume of the same size within the EC2 Console on AWS
# • Attach the volume to the same Instance. Device defaults to /dev/sdf
zpool attach rpool c4t0d0 c1t5d0
zpool status # wait for resilver to complete
zpool detach rpool c4t0d0 # because it's mislabeled
zpool attach rpool c1t5d0 c1t0d0 # reattach same volume, now using correct name (matching sudo format)
zpool status # wait for resilver to complete
zpool detach rpool c1t5d0
# • Now you can detach and delete that volume from EC2

### UPDATE packages ###

pkg install pkg # might be needed before pkg update works
pkg update

# now, if it says if it shows "Create boot environment: Yes", then
beadm list # verify that the new boot environment is active
#beadm activate omnios-1 # activate it if it is not already
# If you get "Unable to activate omnios-1." "Error installing boot files." then the RESOLVE was not correctly completed above

reboot # you can try -f (fast) option but I tend to think it doesn't work on AWS

### UPGRADE to latest stable release ###
# visit https://omniosce.org/upgrade to ensure that you can upgrade to the version you desire, and that it is not too big a jump over multiple versions
# [Backup any data as needed first!]
pkg set-publisher -r -O https://pkg.omniosce.org/r151030/core omnios
pkg set-publisher -r -O https://pkg.omniosce.org/r151030/extra extra.omnios
pkg update -f -r --be-name=r151030
reboot

### CUSTOMIZATION ###

echo "\n# Below lines added by us:\n\numask 027\nPATH=/700s/sys/bin:/opt/local/sbin:/opt/local/bin:/usr/gnu/bin:/usr/bin:/usr/sbin:/sbin\nMANPATH=/opt/local/man:/usr/share/man\n\nexport LANG=en_US.UTF-8\n\nexport PS1=\"\u@\h:\w\\\\\\$ \"\n\nalias beep='echo -en \\\\\\\\a'\nalias ls='ls --color'\nalias grep='grep --color'\nalias l='ls -lh'\n\ncomplete -d cd" >> /etc/profile
exit
# login again
echo "#"'!'"/usr/bin/sh\ncase \"\$1\" in\n'start')\n\t/700s/sys/env /700s/sys/start/all\n\t;;\n'stop')\n\t/700s/sys/env /700s/sys/stop/all\n\t;;\n*)\n\techo \"Usage: \$0 { start | stop }\"\n\texit 1\n\t;;\nesac\nexit 0" > /etc/rc3.d/S700s
chmod u+x /etc/rc3.d/S700s; chgrp staff /etc/rc3.d/S700s
ln -s ../rc3.d/S700s /etc/rc0.d/K700s
(grep '#' /etc/auto_master; echo; echo "## Lines removed by us"; grep -v '#' /etc/auto_master | sed 's/^/#/') > /etc/auto_master.new; cat /etc/auto_master.new > /etc/auto_master; rm /etc/auto_master.new
svcadm disable -s autofs; svcadm enable -s autofs; svcadm disable -s autofs
zfs create -o mountpoint=/home -o compress=on -o dedup=on rpool/home
rmdir /net
chgrp staff /home
chmod g+s,o= /home
useradd -D -g 10 -s /usr/bin/bash # sets default settings for user accounts
echo "\n# Below lines added by us:\n%sudoers ALL=(ALL) ALL" >> /etc/sudoers
groupadd -g 100 sudoers
groupadd -g 101 700s
usermod -G 700s webservd
usermod -G 700s mysql

### USER creation ###
useradd -u 100 -G sudoers,700s,mysql bryan # create your own user with the id consistent with the other servers, if any
mkdir /home/bryan; chown bryan:staff /home/bryan

passwd bryan # this is quite important, since bryan is the only sudoer right now
sudo -u bryan sudo passwd -N root # this command will test sudo works and then remove the root password (requiring us to use sudo)

# note that ssh key access is still possible to access root login!
# keep this safely secured, or remove the key association from server
 
### MORE CUSTOMIZATION ###

zfs create -V 1G rpool/swap
swap -a /dev/zvol/dsk/rpool/swap

svcadm disable sendmail # enabled later when configured
svcadm disable sendmail-client
svcadm disable ndp # this one doesn't persist across reboot for some reason, I think some others are like this as well
svcadm disable zones
svcadm disable ktkt_warn
svcadm disable metainit
svcadm disable gss
svcadm disable rpc/bind
svcadm disable smserver # used in CDE (desktop) for managing removable devices
svcadm disable group:default # best I can tell, used for SAMBA, related to network shared folders
svcadm disable group:zfs
svcadm disable sac
svcadm disable metasync
svcadm disable dbus
svcadm disable hal
svcadm disable fcoe_initiator
svcadm disable ipsecalgs
svcadm disable ipsec/policy
svcadm disable zones-monitoring
svcadm disable resource-mgmt
svcadm disable iscsi/initiator
svcadm disable rpc/bind # for security, close TCP port sunrpc
svcadm disable iptun
svcadm disable routing/route # for security, close TCP port 520 (route)
mv /etc/rc2.d/S81dodatadm.udaplt /etc/rc2.d/s81dodatadm.udaplt
pkg change-facet --no-backup-be facet.locale.de=false facet.locale.de_DE=false facet.locale.es=false facet.locale.es_ES=false facet.locale.fr=false facet.locale.fr_FR=false facet.locale.it=false facet.locale.it_IT=false facet.locale.ja=false facet.locale.ja_*=false facet.locale.ko=false facet.locale.ko_*=false facet.locale.pt=false facet.locale.pt_BR=false facet.locale.zh=false facet.locale.zh_CN=false facet.locale.zh_TW=false # reduces disk usage by 0.11G, requires internet connection to work
pkg install gnu-tar
pkg install git
sudo git config --global --edit # set default name and email for commits done as root

chmod g+w /etc/motd; sudo chgrp staff /etc/motd

zfs create -o mountpoint=/opt/local rpool/opt-local
cd /tmp; curl -O https://pkgsrc.joyent.com/packages/SmartOS/bootstrap/bootstrap-trunk-x86_64-20190317.tar.gz
cd /; tar -zxpf /tmp/bootstrap-trunk-x86_64-20190317.tar.gz
mkdir /opt/local/var /opt/local/var/db
mv /var/db/pkgin /opt/local/var/db
ln -s ../../opt/local/var/db/pkgin /var/db

pkgin -y install nodejs

### PRIMARY directory /700s ###

zfs create -o mountpoint=/700s -o aclinherit=passthrough -o snapdir=visible -o dedup=on rpool/700s
zfs set mountpoint=none rpool/700s
zfs create -o mountpoint=/700s rpool/700s/main
chmod g=rx,o= /700s; chgrp 700s /700s
zfs create -o dedup=off -o mountpoint=/700s/log rpool/700s/log
zfs create -o mountpoint=/700s/space rpool/700s/space
mkdir /700s/more /700s/svc /700s/sys /700s/var /700s/web /700s/lib
chgrp staff /700s/log /700s/svc /700s/sys /700s/web /700s/var /700s/space /700s/more /700s/lib
chgrp staff /700s/more; chmod g+s /700s/more
chmod u=rwx,g=rxs,o=x /700s/sys /700s/log /700s/var /700s/svc /700s/var
mkdir /700s/sys/start /700s/sys/stop /700s/sys/bin
chmod o+x /700s/sys/bin
chmod g+s /700s/web /700s/lib

cd /700s
git init
git remote add origin https://github.com/musicw/700s-server.git
git pull https://github.com/musicw/700s-server.git master

mkdir node_modules; chgrp 700s node_modules; chmod g+s node_modules
sudo npm install mysql2 libmime libqp libbase64

chmod+660 /700s/more
chmod+664- /700s/web /700s/lib
chmod+660 /700s/space

chgrp staff .gitignore
chmod a+rx  /700s/sys/env
chmod o+x /700s/svc/webserv /700s/svc/webserv/bin /700s/svc/webserv/lib
chmod o+r /700s/svc/webserv/bin/* /700s/svc/webserv/lib/*

# needed because git doesn't bring all that in
chmod o+X /700s/lib/node
chmod o+r /700s/lib/node/*

logadm -C4 -w /700s/log/webserv.log # set automatic log file rotation, 4 copies
logadm -C2 -w /700s/log/mysql-error.log

### setup mysql ###

echo "complete -W \"\`echo \\\`mysql -se 'select schema_name\"\" from information_schema.SCHEMATA' 2> /dev/null\\\`\`\" mysql\n" >> /etc/profile

zfs create -o dedup=off -o compression=off -o mountpoint=/700s/db rpool/700s/db
zfs create -o compression=gzip rpool/700s/db/binlogs
chown mysql:mysql /700s/db /700s/db/binlogs; chmod g+s,o= /700s/db /700s/db/binlogs; chmod o=x /700s/db
mkdir /700s/dbi; chmod o=x /700s/dbi; chgrp staff /700s/dbi

ln -s ../../../700s/sys/misc/my.cnf /etc/my.cnf
touch /700s/log/mysql-error.log; chown mysql /700s/log/mysql-error.log

chmod a+rX /700s/sys/misc/mysqld-svc-method /700s/sys/misc/my.cnf # might be redundant, depending on how git brings it in..

pkgin -y install mysql-server

chmod a+rX /opt/local/lib/svc /opt/local/lib/svc/method
chmod -R a+rX /opt/local/share/mysql
mv /opt/local/lib/svc/method/mysqld /opt/local/lib/svc/method/mysqld.orig
ln -s ../../../../../700s/sys/misc/mysqld-svc-method  /opt/local/lib/svc/method/mysqld

ln -s /700s/db /var/mysql # needed only because the way the service was configured. my.cnf dictates otherwise
svcadm enable mysql

# set mysql root password
X=`openssl rand -base64 9`
mysqladmin password "$X"
echo "[client]\nuser=root\npassword=$X" > ~/.my.cnf
chmod 600 ~/.my.cnf

mysql mysql -e 'delete from user where user="" or host<>"127.0.0.1"; flush privileges'

# additional users
X=`openssl rand -base64 9`
mysql -e "grant all on *.* to bryan@localhost identified by '$X' with grant option"
echo "[client]\nuser=bryan\npassword=$X" > /home/bryan/.my.cnf
chmod 600 /home/bryan/.my.cnf; chown bryan /home/bryan/.my.cnf

# timezones
mysql_tzinfo_to_sql /usr/share/lib/zoneinfo | mysql --force mysql

### configure mail ###

#pkgin -y sendmail

# decided not to use sendmail, but just the preinstalled DragonFly Mail Authority (dma)
# • in /etc/dma/dma.conf, uncomment SECURETRANSFER and STARTTLS and OPPORTUNISTIC_TLS
# • also configure MAILNAME to match site domain
# • set SMARTHOST and auth.conf to use smtp relaying service




