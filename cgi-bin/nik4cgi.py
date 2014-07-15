#!/usr/bin/python
# CGI interface to Nik4 with custom properties
# Tailored to veloroad style, but works with others
# Written by Ilya Zverev, licensed WTFPL.

import os, sys
import re, cgi, datetime
import tempfile, subprocess, shutil
import cfg
import cgitb
cgitb.enable()

def error_die(msg):
	print 'Content-Type: text/plain; charset=utf-8'
	print ''
	print 'Error: {}'.format(msg);
	sys.exit(1)

class MyFieldStorage(cgi.FieldStorage):
	def make_file(self, binary=None):
		return tempfile.NamedTemporaryFile('wb+', delete=False)

form = MyFieldStorage()
options = {}
variables = {}

# bounding box
if 'bbox' in form:
	bbox = form.getfirst('bbox')
	if re.match('^[0-9.-]+(?:,[0-9.-]+){3}$', bbox):
		options['bbox'] = ' '.join(bbox.split(','))

# image dimensions
mode = form.getfirst('dim', 'both')
if mode == 'zoom' and 'zoom' in form:
	zoom = form.getfirst('zoom')
	if re.match('^\d\d?$', zoom):
		options['zoom'] = zoom
elif 'width' in form or 'height' in form:
	dim = '{} {}'.format(form.getfirst('width', '0') if mode != 'height' else 0, form.getfirst('height', '0') if mode != 'width' else 0)
	if not re.match('^\d{1,5} \d{1,5}$', dim):
		error_die('Dimensions are  incorrect: ' + dim)
	if form.getfirst('units', '') == 'px':
		whkey = 'size-px'
	else:
		whkey = 'size'
		options['ppi'] = '300'
	options[whkey] = dim
	if 'margin' in form:
		margin = form.getfirst('margin')
		if re.match('^\d\d?$', margin):
			options['margin'] = margin
	if mode == 'width' or mode == 'height':
		options['norotate'] = None

	# test for size limit
	size = dim.split(' ')
	mult = max(int(size[0]), int(size[1]))
	mult = mult * mult
	if 'ppi' in options:
		mult = mult * 16
	if mult > 2000*2000:
		error_die('Dimensions are too big')

# GPX trace (specific to veloroad style)
if cfg.ROUTE and 'trace' in form and form['trace'].filename:
	if not hasattr(form['trace'].file, 'name'):
		# for some reason small files are not make_file'd
		fp = tempfile.NamedTemporaryFile('wb+', delete=False)
		fp.write(form['trace'].value)
		fp.close()
		form['trace'].file = fp
	variables['route'] = form['trace'].file.name
	if 'fit' in form:
		del options['bbox']
		if 'norotate' in options:
			del options['norotate']
		options['fit'] = cfg.ROUTE
	if 'drawtrace' in form:
		options['add-layers'] = cfg.ROUTE

# scale bar (specific to veloroad style)
if cfg.SCALE and 'scale' in form:
	scalepos = form.getfirst('scalepos', '')
	if re.match('^[0-9.-]+, *[0-9.-]+$', scalepos):
		options['add-layers'] = ','.join([cfg.ROUTE, cfg.SCALE]) if 'add-layers' in options else cfg.SCALE
		variables['scale'] = scalepos
		scalens = re.match('^([1-9])-([1-5][05]?)$', form.getfirst('scalens', '5-1'))
		variables['scalen'] = scalens.group(1) if scalens else 5
		variables['scales'] = scalens.group(2) if scalens else 1

# map style, file format and mime type
style = form.getfirst('style') if form.getfirst('style', '') in cfg.STYLES else next(iter(cfg.STYLES))
fmt = form.getfirst('format') if form.getfirst('format', '') in cfg.FORMATS else next(iter(cfg.FORMATS))
options['format'] = fmt
mime = cfg.FORMATS[fmt]

# build command line for nik4
outfile, outputName = tempfile.mkstemp()
command = [cfg.NIK4]
for k,v in options.items():
	command.append('--{}'.format(k))
	if v is not None:
		command.extend(v.split(' '))
command.append(cfg.STYLES[style])
command.append(outputName)
if cfg.PARAMETRIC:
	command.append('--vars')
	for k,v in variables.items():
		command.append('{}={}'.format(k, v))

# check for running nik4
ps = subprocess.Popen('ps -e|grep nik4.py', shell=True, stdout=subprocess.PIPE)
psout, _ = ps.communicate()
if 'nik4' in psout:
	error_die('Nik4 is running, please try later.')

# start nik4 process
process = subprocess.Popen(command, stderr=subprocess.PIPE)
_, err = process.communicate()
code = process.returncode
if code == 0 and os.stat(outputName).st_size > 0:
	if fmt == 'svg':
		# run mapnik-group-text
		mgt = __import__('mapnik-group-text')
		mgt_opt = { 'dmax': 60, 'group': True }
		mgt.process_stream(open(outputName, 'rb'), outputName, mgt_opt)
		# run svn-resize if dimensions are known
		if 'size' in options or 'size-px' in options:
			mgt.process_stream(open(outputName, 'rb'), outputName, mgt_opt)
			svgr = __import__('svg-resize')
			svgr_opt = {}
			if 'size' in options:
				d = options['size'].split(' ')
				suffix = 'mm'
			else:
				d = options['size-px'].split(' ')
				suffix = 'px'
			if 'norotate' in options or not d[0] or not d[1]:
				if d[0]:
					svgr_opt['width'] = d[0] + suffix
				if d[1]:
					svgr_opt['height'] = d[1] + suffix
			else:
				svgr_opt['longest'] = max(d[0], d[1]) + suffix
				svgr_opt['shortest'] = min(d[0], d[1]) + suffix
			if 'margin' in options:
				svgr_opt['margin'] = options['margin']
			svgr_opt['frame'] = True
			svgr_opt['input'] = outputName
			svgr.process_stream(svgr_opt)
	print 'Content-Type: {}'.format(mime)
	print 'Content-Disposition: attachment; filename={}-{}.{}'.format(style, datetime.datetime.now().strftime('%y%m%d-%H%M'), fmt)
	print 'Content-Length: {}'.format(os.stat(outputName).st_size)
	print ''
	with open(outputName, 'rb') as f:
		shutil.copyfileobj(f, sys.stdout)
else:
	print 'Content-Type: text/plain; charset=utf-8\n'
	if code > 0:
		print 'Error {} happened.'.format(code)
	else:
		print 'Resulting file is empty.'
	print 'Command line:\n{}\n\nOutput:\n'.format(' '.join(command))
	print err
os.remove(outputName)

# remove temporary file with a trace
if 'trace' in form and form['trace'].filename:
	os.remove(form['trace'].file.name)
