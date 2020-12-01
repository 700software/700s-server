#!/usr/bin/env node /700s/svc/webserv/lib/child_io.node.js
if (!this.cio) { console.error('Direct usage not permitted. Please use load using child_io.node.js'); process.exit(9) }

var listeners = [
    { name: 'https', host: '*', port: 443, protocol: 'https', docroot: '/700s/web', multiDomain: true, },
    { name: 'http', host: '*', port: 80, protocol: 'http', docroot: '/700s/web', multiDomain: true, },
]

var path = require('path')
var util = require('util')
var net = require('net')
var dns = require('dns')
var http = require('http')
var https = require('https')
var fs = require('fs')
var os = require('os')
var child_process = require('child_process')
var log = module.parent.require('../lib/log.node.js')
var http_extra = module.parent.require('../lib/http_extra.node.js')
var lockers = module.parent.require('/700s/lib/node/lockers.node.js')

var usrRoot = 0
var grpStaff = 10

module.parent.require('../lib/msg_io.node.js').extend(cio)
module.parent.require('../lib/http_io.node.js').extend(cio)

var closing = false
var connections = []
var locker = lockers()
var listening = []

var todo = 0
var anyYes = false
var anyNo = false
listeners.forEach(function (listener) {

    launch(false)

    function launch(isRetry) {

        var module = listener.protocol == 'http' ? http : listener.protocol == 'https' ? https : null

        listener.disp = function () {
            return listener.name + ' (' + disp() + ')'
        }

        var options = {}
        ++todo; addOptions(function (abort) {
            try {
                if(!abort) {
                    try {
                        if (listener.protocol == 'https') {
                            listener.server = module.createServer(options, onrequest)
                            
                            if (options.myContexts)
                                for (var i = 0; i < options.myContexts.length; i++)
                                    listener.server.addContext(options.myContexts[i][0], options.myContexts[i][1])
                            
                        } else
                            listener.server = module.createServer(onrequest)
                    } catch(e) {
                        log.err('Configuration error for listener ' + listener.disp() + ': ' + (e.message || e))
                        return
                    }
                    oncreate()
                }
            } finally {
                if(!--todo) aldone()
            }
        })
        function addOptions(callback) { // add entries to options that might be needed for createServer to work
            if (listener.protocol == 'https') {
                httpsOptions(listener, function (abort, opts) { // produce certificate stuff for https
                    for (var x in opts)
                        options[x] = opts[x]
                    callback(abort) // proceed to https.createServer
                })
            } else
                callback()
        }
        function oncreate() {
            listener.server.on('connection', function (socket) {
                connections.push(socket)
                cio.locker.add('using')
                socket.on('close', function () {
                    cio.locker.unlock('using')
                    connections.splice(connections.indexOf(socket), 1)
                })
            }).on('error', function (err) {
                listener.listening = false
                log.err((isRetry ? 'After retry: ' : '') + 'Error on listener ' + listener.disp() + ': ' + (err.message || err))
                setTimeout(function () {
                    launch(true)
                    depart()
                }, isRetry ? 10000 : 2000).unref()
            })

            todo++
            listen()
            function listen() {
                if(typeof listener.port == 'number' && listener.host != '*') {
                    dns.lookup(listener.host, function (err, ip) {
                        if(err) {
                            log.err(err.message + ' when looking up ' + listener.host + ' for listener ' + listener.name + ' (port ' + listener.port + ')')
                            proceed()
                        } else {
                            listener.host = ip
                            listener.listening = true
                            listener.server.listen(listener.port, ip, listener.host, proceed)
                        }
                    })
                } else {
                    listener.listening = true
                    listener.server.listen(listener.port, proceed)
                }
            }
            function proceed() {
                log.rotation('listening on ' + disp() + ' (' + listener.name + ')')
                depart()
            }
            function depart() {
                depart = function () {
                    console.error(new Error("Didn't think this could ever be called twice.").stack)
                }
                if(!--todo) aldone()
            }
        }
        function disp() {
            if(typeof listener.port == 'number')
                return listener.host + ':' + listener.port
            else
                return listener.port
        }

        function onrequest(req, res) {

            req.listenerName = listener.name
            req.listenerDocroot = listener.docroot
            req.listenerMultiDomain = listener.multiDomain
            req.protocol = listener.protocol

            var writeHeadO = res.writeHead
            var endO = res.writeHead
            res.writeHead = function () { // during server restart, close connections that had a request in progress
                if(closing && !res.getHeader('Connection'))
                    res.setHeader('Connection', 'Close')
                writeHeadO.apply(this, arguments)
            }
            var socket = req.socket
            socket.http_io_using = true
            var endO = res.end
            res.end = function () {
                if(closing && !res.getHeader('Connection'))
                    req.connection.setTimeout(4000) // shorter timeout to get the connection to close so this process can shut down.
                socket.http_io_using = false
                endO.apply(this, arguments)
            }

            http_extra.sanitize(req, res, cio.http_request) // the callback is only called if the request passed sanitation

        }

    }

})
if(!todo) aldone()

cio.on('shutdown', function () {
    if(anyYes)
        log.rotation(!anyNo ? 'downtime begins' : 'listener shutdown')
    closing = true
    var todo = 0
    listeners.forEach(function (listener) { // closes sockets preventing new connections
        if(listener.listening) {
            todo++; listener.server.close(function () {  // waits for existing http connections to close
                if(!--todo) done()
            })
        }
    })
    for(var i = 0; i < connections.length; i++) // closes any connections it can without producing errors
        if(!connections[i].http_io_using)
            connections[i].destroy()
    if(!todo) done()
    function done() {
        cio.send('listener close') // tells parent that it can end our process, as there will be no additional requests coming in.
    }
})

function aldone() {
    for(var i = 0; i < listeners.length; i++)
        if(listeners[i].listening)
            anyYes = true
        else
            anyNo = true
    if(anyYes && !anyNo)
        log.end('uptime begins')
    if (process.getuid && process.getuid() == 0) { // reduces privileges if launched from root with fork option
        var http_generic = module.parent.require('./http_generic.node.js')
        process.initgroups('webservd', 'webservd')
        process.setgid('webservd')
        process.setuid('webservd')
    }
}

function httpsOptions(listener, callback) {
    var brand = module.filename.replace(/\/[^\/]*\/[^\/]*$/, '').replace(/^.*\//, '')
    var dir = '/700s/var/' + brand
    var options = { }
    if (listener.protocol == 'https')
        fs.stat(dir, function (err, stats) {
            var readme = dir + '/' + os.hostname() + '-' + brand + '-' + listener.name + '-readme.txt'
            if (err)
                if (err.code == 'ENOENT') {
                    fs.mkdir(dir, function (err) {
                        if (err) {
                            log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                            callback(true)
                        } else
                            ondir()
                    })
                } else {
                    log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                    callback(true)
                }
            else
                ondir()
            function ondir() {

                var file = dir + '/' + os.hostname() + '-' + brand + '-' + listener.name + '-key.pem'
                var csr = '/tmp/' + os.hostname() + '-' + brand + '-' + listener.name + '-csr.pem'
                var cert = dir + '/' + os.hostname() + '-' + brand + '-' + listener.name + '-cert.pem'
                var icas = dir + '/' + os.hostname() + '-' + brand + '-' + listener.name + '-icas.pem'
                var cnf = dir + '/' + os.hostname() + '-' + brand + '-' + listener.name + '-csr.cnf'

                var icasPrefix = os.hostname() + '-' + brand + '-' + listener.name + '-icas-'
                var certPrefix = os.hostname() + '-' + brand + '-' + listener.name + '-cert-'

                fs.stat(readme, function (err) {
                    if (err && err.code == 'ENOENT' || stats && stats.size == 0) {

                        fs.writeFile(readme, ''
                                + '700 Software lite webserver SSL readme - autogenerated ' + yyyymmddhhmmss(new Date()) + '\n'
                                + '============================================\n'
                                + '\n'
                                + 'The ' + brand + ' listener ' + listener.name + ' requires a TLS/SSL certificate to operate.\n'
                                + '\n'
                                + '### https certificate installation / renewal instructions: ###\n'
                                + '\n'
                                + '  1. Create a Certificate Signing Request (CSR)\n'
                                + '\n'
                                + '     sudo openssl req -sha256 -new -key ' + file + ' -config ' + cnf + ' -out ' + csr + '\n'
                                + '     sudo chown $USER ' + csr + '\n'
                                + '\n'
                                + '  2. Buy the TLS/SSL Certificate from the Certificate Authority. (e.g. through NameCheap)\n'
                                + '     You will need the contents of ' + csr + ' file to make the purchase.\n'
                                + '     When they give you the certificate, upload to ' + cert + '\n'
                                + '\n'
                                + '-or- for testing, you could create a self-signed certificate, but this produces a security warning in the browser\n'
                                + '     sudo openssl x509 -req -days 3650 -in ' + csr + ' -signkey ' + file + ' -out ' + cert + '\n'
                                + '\n'
                                + '  3. If the Certificate Authority provided an Intermediate CA certificate, this **must** be installed to prevent compatibility problems with some browsers.\n'
                                + '     The intermediate certificate should be placed in: ' + icas + '\n'
                                + '     If there are multiple, they can be concatenated together. The icas file will be split into parts again by ' + brand + '.\n'
                                + '     Blank lines, and those starting with # are ignored, so you could add comments to the file to designate which intermediate certificate is which.\n'
                                + '\n'
                                + '  4. Restart ' + brand + ' for certificate to take effect. There should be an "uptime begins" message in the log.\n'
                                + '     /700s/svc/' + brand + '/restart; tail -0f /700s/log/' + brand + '.log\n'
                                + '\n'
                                + '  5. Test in browser.\n'
                                + '     note: Your browser may have the Intermediate CA certificate memorized, in which case step 3 doesn\'t get tested. Your CA may have a more robust test page that you can use.\n'
                                + '\n'
                                + '### special feature: multiple https certificates via SNI ###\n'
                                + '\n'
                                + 'The browser support for SNI is not as good as for SAN, but the good thing about SNI is you do not have to list all your domains in a single certificate.\n'
                                + 'Installing a domain-specific certificate to be served via SNI follows the same process as steps 1-5 above, except that you add the domain name to the end of the csr, cert and icas files.\n'
                                + '\n'
                                + 'For SNI, ' + brand + ' will look for ' + certPrefix + 'example.com.pem and ' + icasPrefix + 'example.com.pem\n'
                                + '\n'
                                , function (err) {
                                    if (err) throw erro
                                    if (process.getuid() == usrRoot)
                                        fs.chown(readme, usrRoot, grpStaff, function () { })
                                })

                        fs.stat(cnf, function (err) {
                            if (err && err.code == 'ENOENT' || stats && stats.size == 0) {
                                var domain = 'example.com'
                                fs.writeFile(cnf, ''
                                        + '[req]\n'
                                        + 'distinguished_name = req_distinguished_name\n'
                                        + '\n'
                                        + '# ##\n'
                                        + '# # To add Subject Alt. Names (required when domain name is IP, or when there\'s more than one domain name to sign for)\n'
                                        + '# # * Uncomment lines below and save before making CSR. Be sure to update the alt_names area to fit your requirements.\n'
                                        + '# # * If/when making a self-signed certificate, use this command. Otherwise check with your CA to ensure they will include SANs in the certificate they provide.\n'
                                        + '# #   sudo openssl x509 -req -days 3650 -in ' + csr + ' -signkey ' + file + ' -out ' + cert + ' -extensions v3_req -extfile ' + cnf + '\n'
                                        + '# ##\n'
                                        + '#req_extensions = v3_req\n'
                                        + '#[v3_req]\n'
                                        + '#basicConstraints = CA:FALSE\n'
                                        + '#keyUsage = nonRepudiation, digitalSignature, keyEncipherment\n'
                                        + '#subjectAltName = @alt_names\n'
                                        + '#[alt_names]\n'
                                        + '#DNS.1 = ' + domain + ' # I think that the 1st SAN domain should match Common Name below. —Bryan\n'
                                        + '## DNS.2 = something-else.example.com # example alternate domain to sign for, allowing https access to multiple domains on single listener. (server/ip/port)\n'
                                        + '## DNS.3 = etc.example.com # increment number to add more\n'
                                        + '## IP.1 = ' + (net.isIP(listener.host) ? listener.host + ' # example to sign for IP address (i.e. red-https)' : listener.host + ' # could replace with IP address (i.e. red-https)') + '\n'
                                        + '\n'
                                        + '[req_distinguished_name]\n'
                                        + 'countryName = Country Name (2 letter code)\n'
                                        + 'countryName_default = US\n'
                                        + 'stateOrProvinceName = State or Province Name (full name)\n'
                                        + 'stateOrProvinceName_default = TN\n'
                                        + 'localityName = Locality Name (eg, city)\n'
                                        + 'localityName_default = Chattanooga\n'
                                        + 'organizationName = Organization Name (eg, company)\n'
                                        + 'organizationName_default = 700 Software\n'
                                        + 'organizationalUnitName = Organizational Unit Name (eg, section)\n'
                                        + 'organizationalUnitName_default = \n'
                                        + 'commonName = Common Name (domain name of the https website)\n'
                                        + 'commonName_default = ' + domain + '\n'
                                        + 'commonName_max = 64\n'
                                        + '\n'
                                        + '\n'
                                        + '', function (err) {
                                            if (err) throw erro
                                            if (process.getuid() == usrRoot)
                                                fs.chown(cnf, usrRoot, grpStaff, function () { })
                                        })
                            }
                        })

                    }
                })

                fs.readFile(file, function (err, key) {
                    if (err && err.code == 'ENOENT' || key.length == 0) {
                        fs.writeFile(file, '', { mode: 0600 }, function (err) { if(err) throw err // make file with correct permissions
                            fs.chmod(file, 0400, function (err) { if(err) throw err // (in case empty file already exists)
                                log.err('Generating private key for listener ' + listener.disp() + '...')
                                var openssl = child_process.execFile('openssl', [ 'genrsa', '-out', file, '4096' ], function (err, stdout, stderr) {
                                    if (err)
                                        log.err('Error generating private key for listener ' + listener.disp() + ': ' + (err.message || err))
                                    if (openssl.status) {
                                        log.err('Error generating private key for listener ' + listener.disp() + ': openssl exited with status ' + openssl.status)
                                        if (stderr) log.warn(stderr.replace(/\n$/, '').replace(/^/mg, 'openssl: '))
                                    }
                                    fs.readFile(file, function (err, key) {
                                        if (err) {
                                            log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                                            callback(true)
                                        } else
                                            onPrivateKey(key, true)
                                    })
                                })
                            })
                        })
                    } else if (err) {
                        log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                        callback(true)
                    } else
                        onPrivateKey(key)
                })

                function onPrivateKey(key, brandnew) {
                    options.key = key
                    var file = cert
                    fs.readFile(file, function (err, cert) {
                        if (err)
                            if (err.code == 'ENOENT') {
                                if (brandnew)
                                    log.err('Private key generated. See ' + readme + ' for instructions to install https certificate.')
                                else
                                    log.err('No certificate for ' + listener.disp() + ': ' + (err.message || err) + '\nSee ' + readme + ' for instructions to install https certificate.')
                                callback(true)
                            } else {
                                log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                                callback(true)
                            }
                        else
                            onCertificate(cert)
                    })
                }

                function onCertificate(cert) {
                    options.cert = cert
                    var file = icas
                    fs.readFile(file, 'utf8', function (err, icas) {
                        if (err)
                            if (err.code == 'ENOENT') {
                                onIntermediateCas()
                            } else {
                                log.err('Error for listener ' + listener.disp() + ': ' + (err.message || err))
                                callback(true)
                            }
                        else {
                            icas = icas.replace(/#.*/g, '').replace(/[ \t]+$/g, '').replace(/^\r?\n?/mg, '') // remove comments and blank lines
                            options.ca = []
                            var regex = /^-----BEGIN CERTIFICATE-----$\r?\n?(?:^.*$\r?\n?)+?^-----END CERTIFICATE-----$\r?\n?/mg
                            var match = regex.exec(icas)
                            while (match != null) {
                                options.ca.push(Buffer.from(match[0]))
                                match = regex.exec(icas)
                            }
                            onIntermediateCas()
                        }
                    })
                }

                function onIntermediateCas() { loadAlternativeDomainsForSni() }
                
                function loadAlternativeDomainsForSni() {

                    options.myContexts = []

                    fs.readdir(dir, function (err, files) {
                        if (err) {
                            log.err('Error initiating SNI features for ' + listener.disp() + ': ' + (err.message || err))
                            callback(false, options)
                        } else {
                            for (var i = 0; i < files.length; i++) {
                                if (files[i].startsWith(certPrefix) && files[i].endsWith('.pem')) {
                                    var domain = files[i].substring(certPrefix.length, files[i].length - 4)
                                    try {

                                        var cert = fs.readFileSync(dir + '/' + files[i])
                                        
                                        try {
                                            var icas = fs.readFileSync(dir + '/' + icasPrefix + domain + '.pem', 'utf8')
                                            
                                            var ca = []
                                            icas = icas.replace(/#.*/g, '').replace(/[ \t]+$/g, '').replace(/^\r?\n?/mg, '') // remove comments and blank lines
                                            var regex = /^-----BEGIN CERTIFICATE-----$\r?\n?(?:^.*$\r?\n?)+?^-----END CERTIFICATE-----$\r?\n?/mg
                                            var match = regex.exec(icas)
                                            while (match != null) {
                                                ca.push(Buffer.from(match[0]))
                                                match = regex.exec(icas)
                                            }
                                            
                                        } catch(e) {
                                            if (e.code != 'ENOENT') throw e
                                        }
                                        
                                        if (ca) {
                                            // Is this a Node.JS Bug? I have to add to the main ca options, instead of the one passed to tls.addContext.
                                            // However, docs for addContext clearly state that ca is a possible option to customize
                                            for(var j = 0; j < ca.length; j++)
                                                options.ca.push(ca[j])
                                            ca = null
                                        }
                                        
                                        options.myContexts.push([ domain, { cert: cert, ca: ca, key: options.key } ]) // eventually passed to tls.addContext
                                        
                                    } catch (err) {
                                        log.err('Error loading custom HTTPS certificate for ' + domain + ' (' + listener.disp() + '): ' + (err.message || err))
                                    }
                                }
                            }
                            callback(false, options) // downgrade permissions so no further files can be read
                        }
                    })

                }

            }
        })
    else
        callback(false, options)
}

function yyyymmddhhmmss(date) {
    return '' + date.getFullYear() + '-' + zero(date.getMonth() + 1) + '-' + zero(date.getDate()) + ' ' + zero(date.getHours()) + ':' + zero(date.getMinutes()) + ':' + zero(date.getSeconds())
}
function zero(x) {
    if (x < 10)
        return '0' + x
    else
        return x
}
