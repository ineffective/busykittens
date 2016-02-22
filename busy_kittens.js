function jda_busy_kittens_initialise() {
	window.jda_busy_kittens = {
		hunt: {
			toggle: function() {
				if (this.huntInterval === null) {
					this.huntInterval = setInterval(function() { game.village.huntAll(); }, this.huntMillis);
					$('#bkahbutton').prop('value', "STOP HUNT");
				} else {
					clearInterval(this.huntInterval);
					this.huntInterval = null;
					$('#bkahbutton').prop('value', "START HUNT");
				}
			},
			huntMillis: 2000,
			huntInterval: null
		},
		praiseSun: {
			toggle: function() {
				if (this.praiseSun === false) {
					$('#praiseSun').prop('value', "STOP AUTO-PRAISE");
					this.praiseSun = true;
				} else {
					$('#praiseSun').prop('value', "START AUTO-PRAISE");
					this.praiseSun = false;
				}
			},
			praise: function() {
				if (this.praiseSun === true) {
					gamePage.religion.praise();
				}
			},
			praiseSun: false
		},
		speed: {
			paused: false,
			toggle: function () {
				if (this.paused === true) {
					console.log("starting game");
					gamePage.start();
					this.paused = false;
					$('#gamespeedplaystop').prop('value', "STOP");
				} else {
					console.log("pausing game");
					gamePage.worker.terminate();
					gamePage.worker = undefined;
					this.paused = true;
					$('#gamespeedplaystop').prop('value', "PLAY");
				}
			},
			setRate: function (r) {
				if (r < 1) {
					r = 1;
				}
				gamePage.rate = r;
				$('#gamespeedcurrentrate').html(gamePage.rate);
				if (gamePage.worker !== undefined) {
					gamePage.worker.terminate();
					gamePage.start();
				}
			},
			reset: function() {
				this.setRate(5);
			},
			faster: function(r) {
				rate = gamePage.rate + r;
				this.setRate(rate);
			},
			slower: function(r) {
				rate = gamePage.rate - r;
				if (gamePage.rate < 1) { gamePage.rate = 1; }
				this.setRate(rate);
			},
			single_step: false,
			step_single_frame: function() {
				this.single_step = true;
				gamePage.tick();
				this.single_step = false;
			}
		},
		build: {
			is_limited: function(building) { // check if max resources limit was hit, so no more buildings can be build
				a = building.needed;
				for (x in a) {
					needed = a[x].val;
					resMax = gamePage.resPool.get(a[x].name).maxValue;
					if (resMax === 0) {
						continue;
					}
					if (needed > resMax) {
						return true;
					}
				}
				return false;
			},
			// this checks if building can be built. it also adds resources required to dict 'reserved_res'
			resource_has: function(name) { return gamePage.resPool.get(name).value; },
			resource_per_tick: function(name) {
				var prod = gamePage.resPool.get(name).perTickUI;
				return (prod === undefined) ? 0 : prod;
			},
			resource_get_max_time: function(res_needed) {
				var max_time = 0;
				for (var x in res_needed) {
					var res = res_needed[x];
					var needed = res.val;
					var res_has = this.resource_has(res.name);
					var res_time = Math.ceil((needed - res_has) / this.resource_per_tick(res.name));
					max_time = Math.max(res_time, max_time);
				}
				return max_time;
			},
			can_be_built: function(name, glob_res, local_res) {
				var rv = true; // by default assume that building can be built
				var a = this.buildings[name].needed;
				var res_time = this.resource_get_max_time(a);
				if (res_time == Infinity) {
					return false; // resource won't be ever built, since production is most probably 0
				}
				for (x in a) {
					var needed = a[x].val; // amount of resources needed for construction
					var res = this.resource_has(a[x].name); // amount of resource available
					var prod = this.resource_per_tick(a[x].name); // amount of resource gained per tick
					// now check how much time is needed to produce required amount of resource
					var time_needed = Math.ceil((needed - res) / prod);
					// now, if time is less then res_time, which is max time, we should reserve (res_time - time_needed) * prod less
					// resource than we originally thought
					if (time_needed < res_time) {
						var tmp = (res_time - time_needed) * prod;
						if (isNaN(tmp)) {
							tmp = 0;
						}
						needed -= tmp;
						if (needed < 0) { needed = 0; }
					}
					if (local_res[a[x].name] === undefined || local_res[a[x].name] < needed) {
						local_res[a[x].name] = needed;
					}
					if (glob_res[a[x].name] !== undefined) {
						// return false only if after buying this structure (res - needed < glob_res[a[x].name])
						// we'll be left with less resources than required for higher priority structure
						if (res - needed < glob_res[a[x].name]) {
							rv = false;
						}
					} else {
						if (res < needed) {
							rv = false;
						}
					}
				}
				return rv;
			},
			buildings: {},
			render_pending: false,
			rescan: function() {
				var bd = gamePage.bld.buildingsData;
				for (x in bd) {
					var nm = bd[x].name;
					if (bd[x].unlocked) { // if building is unlocked and not on the buildings list, put it there
						if (this.buildings[nm] === undefined) {
							this.buildings[nm] = {
								name: nm,
								label: ((bd[x].upgradable === true )? bd[x].stages[bd[x].stage || 0].label : bd[x].label),
								group: 0,
								stage: 0,
								count: gamePage.bld.get(nm).val,
								limited: false,
								needed: gamePage.bld.getPrices(nm) };
								this.render_pending = true;
						} else if (bd[x].upgradable === true && bd[x].stage > this.buildings[nm].stage) {
							this.buildings[nm].label = ((bd[x].upgradable === true )? bd[x].stages[bd[x].stage || 0].label : bd[x].label);
							this.buildings[nm].stage = bd[x].stage;
						}
					} else { // if buildings isn't unlocked but for some reason is on the list, remove
						if (this.buildings[nm] !== undefined) {
							delete this.buildings[nm];
							this.render_pending = true;
						}
					}
				}
			},
			global_reserved_resources: { },
			update_reserved_resources: function(reserve) {
				for (y in reserve) {
					if (this.global_reserved_resources[y] === undefined) {
						this.global_reserved_resources[y] = reserve[y];
					} else {
						this.global_reserved_resources[y] += reserve[y];
						// if (this.global_reserved_resources[y] < reserve[y]) {
							// this.global_reserved_resources[y] = reserve[y];
						// }
					}
				}
			},
			select_candidate: function() {
				this.global_reserved_resources = { };
				// in the beginning, both sets are empty. when single group is scanned, resources required by not capped
				// buildings in this group are added to the local_reserved_resources. when group checking is finished and
				// nothing was selected for build, local_reserved_resources are added to global_reserved_resources and
				// next group is checked. this is repeated for all groups.
				// console.log("Global resources");
				// console.log(this.global_reserved_resources);
				var rv = null;
				for (var x = this.groups.length - 1; x > 0; --x) { // > 0 since group 0 is "no-auto-build"
					var local_reserved_resources = { };
					var g = this.groups[x];
					if (g === undefined || g.list === undefined || g.list.length === 0) {
						continue;
					}
					if (this.is_group_limited(g)) {
						continue;
					}
					// group is not limited (i.e. there is at least one building which is not res-capped)
					for (var y = 0 ; y < g.list.length ; ++y) {
						var i = y;
						if (g.list[i].limited) {
							continue;
						}
						if (this.can_be_built(g.list[i].name, this.global_reserved_resources, local_reserved_resources) !== true) {
							continue;
						}
						if (rv === null) {
							rv = g.list[i];
						}
					}
					this.update_reserved_resources(local_reserved_resources);
				}
				// this.render_reserved_resources();
				return rv;
			},
			log_autobuild_event: true,
			build: function() {
				this.render();
				if (!this.do_auto_build) { return; }
				if (jda_busy_kittens.speed.single_step !== true && (gamePage.worker === undefined || gamePage.isPaused === true))
				{
					return; // avoid building when game is paused or not working, but not when single stepping, since this leads to anomalies
				}
				if (gamePage.activeTabId !== "Bonfire") { return ; }
				var candidate = this.select_candidate();
				if (candidate === null) {
					return;
				}
				x = $("div.btn:not(.disabled)>div:contains('" + candidate.label + "')");
				if (x.length > 0) {
					x.click();
					this.render_pending = true;
					if (this.log_autobuild_event === true) {
						gamePage.msg('AutoBuild: ' + candidate.label);
					}
				}
			},
			groups: [],
			rebuild_groups: function() {
				this.rescan();
				this.groups = [];
				for (var x in this.buildings) {
					var g = this.buildings[x].group;
					this.buildings[x].needed = gamePage.bld.getPrices(x);
					this.buildings[x].count = gamePage.bld.get(x).val;
					var new_limited = this.is_limited(this.buildings[x]);
					if (new_limited != this.buildings[x].limited) {
						this.buildings[x].limited = new_limited;
						if (new_limited === true) {
							$("#jdabld" + this.buildings[x].name + "span").addClass("limited");
						} else {
							$("#jdabld" + this.buildings[x].name + "span").removeClass("limited");
						}
					}
					if (this.groups[g] === undefined) {
						this.groups[g] = { list: [], reserved_resources: {} };
					}
					this.groups[g].list.push(this.buildings[x]);
					var res = this.buildings[x].needed;
					for (var r in res) {
						if (this.groups[g].reserved_resources[r.name] === undefined) {
							this.groups[g].reserved_resources[r.name] = r.val;
						} else {
							if (this.groups[g].reserved_resources[r.name] < r.val) {
								this.groups[g].reserved_resources[r.name] = r.val;
							}
						}
					}
				}
			},
			render: function() {
				this.rebuild_groups();
				if (this.render_pending !== true) {
					return;
				}
				this.render_pending = false;
				var s = "";
				var i = this.groups.length;
				s += "<ul>";
				for (var x = i - 1; x >= 0 ; x--) {
					if (this.groups[x] === undefined || this.groups[x].length === 0) {
						continue;
					}
					s += "<li><ul> GROUP " + x + "&nbsp;" + this.render_group_up_down_buttons(x);

					for (b in this.groups[x].list) {
						var bb = this.groups[x].list[b];
						s += "<li><div style='inline-block;'> "+ this.render_building_group_up_down_buttons(bb.name) + "<span id='jdabld" +
						bb.name + "span' class='" + (bb.limited ? 'limited' : '') + "'>" +
						bb.label + "</div></div></li>";
					}
					s += "</ul></li>";
				}
				s += "</ul>";
				$("#jda_busy_kittens_build").html(s);
			},
			render_reserved_resources: function() {
				s = "<table><tr>";
				var row1 = ""; var row2 = "";
				for (b in this.global_reserved_resources) {
					row1 += "<td>" + b + "</td>";
					row2 += "<td>" + this.global_reserved_resources[b].toFixed(2) + "</td>";
				}
				row1 += "</tr>"; row2 += "</tr>";
				s += row1 + row2 + "</table>";
				$("#jda_busy_kittens_reserved").html(s);
			},
			group_up: function(y) {
				if (y === NaN) { return; }
				if (this.groups[y] === undefined) { return; }
				// ok, there is such group, check if group y + 1 exists. if yes, swap them,
				// otherwise simply renumber group to y + 1
				var l = this.groups[y].list;
				for (var b in l) {
					l[b].group = y + 1;
				}
				if (this.groups[y + 1] !== undefined) {
					l = this.groups[y + 1].list;
					for (b in this.groups[y + 1].list) {
						l[b].group = y;
					}
				}
				this.render_pending = true;
				this.render();
				jda_busy_kittens.save.save();
			},
			group_down: function(y) {
				if (y === NaN) { return; }
				if (this.groups[y] === undefined) { return; }
				if (y <= 1) { return; } // can't move anything to/from group 0 automatically
				var l = this.groups[y].list;
				for (var b in l) {
					l[b].group = y - 1;
				}
				if (this.groups[y - 1] !== undefined) {
					l = this.groups[y - 1].list;
					for (b in this.groups[y - 1].list) {
						l[b].group = y;
					}
				}
				this.render_pending = true;
				this.render();
				jda_busy_kittens.save.save();
			},
			building_group_up: function(n) {
				if (this.buildings[n] === undefined) {
					return ;
				}
				this.buildings[n].group += 1;
				jda_busy_kittens.save.save();
				this.render_pending = true;
				this.render();
			},
			building_group_down: function(n) {
				if (this.buildings[n] === undefined) {
					return;
				}
				if (this.buildings[n].group > 0) {
					this.buildings[n].group -= 1;
				}
				jda_busy_kittens.save.save();
				this.render_pending = true;
				this.render();
			},
			is_group_limited: function(group) {
				for (x in group.list) {
					if (group.list[x].limited !== true) {
						return false;
					}
				}
				return true;
			},
			render_group_up_down_buttons: function(number) {
				var s = "";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.group_up(" + number + ");'>+</a>&nbsp;";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.group_down(" + number + ");'>-</a>&nbsp;";
				return s;
			},
			render_building_group_up_down_buttons: function (name) {
				var s = "";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.building_group_up(\"" + name + "\");'>+</a>&nbsp;";
				s += "<a class='jdalnk' href='#' onclick='jda_busy_kittens.build.building_group_down(\"" + name + "\");'>-</a>&nbsp;";
				return s;
			},
			craft: function(name) {
				if (this.do_auto_craft === false) {
					return;
				}
				// if do_auto_build is false, structure construction is not requested. so reset global_reserved_resources to 0, so anything can be crafted.
				if (this.do_auto_build === false) {
					this.global_reserved_resources = { };
				}
				// this function scans available crafts and compares them with global_reserved_resources. Since global_reserved_resources
				// keeps maximum of resource required for all buildings (i.e. if we have: library 100 wood, workshop 400 minerals and 150 wood,
				// and smelter 500 minerals, values stored are wood 150 and minerals 500), we can craft everything over these limits. This will
				// do funny things for wood, since wood can be near maximum and making more from catnip will make more than we can store, but I'm
				// not willing to fix it ATM.
				// 'ere we go. first for each resource check how much we can 'sacrifice'
				var available = { };
				var r = gamePage.resPool.resources;
				for (var x in r) {
					var have = r[x].value - this.crafts_data.get_limit(r[x].name);
					var need = this.global_reserved_resources[r[x].name];
					need = (need === undefined ? 0 : need);
					if (have > 0 && have > need) {
						available[r[x].name] = have - need;
					}
				}
				var crafts = gamePage.workshop.crafts;
				for (var c in crafts) {
					if (!crafts[c].unlocked) {
						continue;
					}
					if (!this.crafts_data.by_name[crafts[c].name].allowed) {
						continue;
					}
					var toCraft = Infinity;
					var prices = crafts[c].prices;
					for (r in prices) {
						var p = available[prices[r].name];
						if (p !== undefined && p !== NaN && p > prices[r].val) {
							var tmp = Math.floor(p / prices[r].val);
							toCraft = (tmp < toCraft) ? tmp : toCraft;
						} else {
							toCraft = 0;
							break; // nothing to do here
						}
					}
					if (toCraft !== Infinity && toCraft > 0) {
						gamePage.craft(crafts[c].name, toCraft);
						for (r in prices) {
							available[prices[r].name] -= toCraft * prices[r].val;
						}
					}
				}
			},
			crafts_data: {
				by_name: {},
				list: [],
				get_limit: function(name) {
					if (this.by_name[name] === undefined || this.by_name[name].limit === undefined || isNaN(this.by_name[name].limit)) {
						return 0;
					}
					return this.by_name[name].limit;
				}
			},
			craft_table_visible: true,
			toggle_craft_table: function(elem) {
				if (this.craft_table_visible) {
					elem.innerHTML = "[+]";
					$("#jda_busy_kittens_craft_table").css({"display": "none"});
				} else {
					elem.innerHTML = "[-]";
					$("#jda_busy_kittens_craft_table").css({"display": ""});
				}
				this.craft_table_visible = !this.craft_table_visible;
			},
			toggle_autobuild_logs: function(elem) {
				if (this.log_autobuild_event === true) {
					this.log_autobuild_event = false;
					elem.innerHTML = "[Show autobuild logs]";
				} else {
					this.log_autobuild_event = true;
					elem.innerHTML = "[Hide autobuild logs]";
				}
			},
			build_table_visible: true,
			toggle_build_table: function(elem) {
				if (this.build_table_visible) {
					elem.innerHTML = "[+]";
					$("#jda_busy_kittens_build").css({"display" : "none"});
				} else {
					elem.innerHTML = "[-]";
					$("#jda_busy_kittens_build").css({"display" : ""});
				}
				this.build_table_visible = !this.build_table_visible;
			},
			usedInCraft: function(name) {
				var c = gamePage.workshop.crafts;
				for (x in c) {
					for (d in c[x].prices) {
						if (c[x].prices[d].name == name) {
							return true;
						}
					}
				}
				return false;
			},
			initialize_crafts: function() {
				var tab = document.createElement("table");
				var crafts = gamePage.resPool.resources;//.crafts;
				var thead = tab.createTHead();
				var row = thead.insertRow(-1);
				row.insertCell(-1).innerHTML = "No.";
				row.insertCell(-1).innerHTML = "USE";
				row.insertCell(-1).innerHTML = "CRAFT";
				row.insertCell(-1).innerHTML = "LIMIT";
				for (var c in crafts) {
					var unlocked = gamePage.workshop.getCraft(crafts[c].name);
					if (unlocked === null) {
						unlocked = true;
					} else {
						unlocked = unlocked.unlocked; // sheesh!
					}
					this.crafts_data.list[c] = { prio: c, allowed: false, unlocked: unlocked, limit: 0, checkbox: null, input_limit: null };
					this.crafts_data.by_name[crafts[c].name] = this.crafts_data.list[c];
					var cd = this.crafts_data.list[c];
					// create element for this craft
					row = tab.insertRow(-1);
					row.insertCell(-1).innerHTML = c;
					
					if (crafts[c].craftable !== undefined && crafts[c].craftable === true) {
						var avail = document.createElement("input");
						avail.type = "checkbox";
						avail.cd = this.crafts_data.list[c];
						$(avail).bind("click", function(num) { return function() {
							jda_busy_kittens.build.crafts_data.list[num].allowed = this.checked;
						}}(c));
						$(row.insertCell(-1)).append(avail);
					} else {
						row.style["display"] = (this.usedInCraft(crafts[c].name) ? "" : "none");
						row.insertCell(-1);
					}
					$(row.insertCell(-1)).html(crafts[c].name);
					var input_limit = document.createElement("input");
					cd.input_limit = input_limit;
					input_limit.type = "number";
					input_limit.value = cd.limit;
					input_limit.cd = this.crafts_data.list[c];
					$(row.insertCell(-1)).append(input_limit);
					var name = cd.name;
					$(input_limit).bind("focusout", function(num) { return function() {
						jda_busy_kittens.build.crafts_data.list[num].limit = parseInt(this.value, 10);
						if (jda_busy_kittens.build.crafts_data.list[num].limit < 0 || isNaN(jda_busy_kittens.build.crafts_data.list[num].limit)) {
							jda_busy_kittens.build.crafts_data.list[num].limit = 0;
						}
						this.value = jda_busy_kittens.build.crafts_data.list[num].limit;
					}}(c));
				}
				$("#jda_busy_kittens_craft_table").append(tab);
			},
			do_auto_build: false,
			toggle_auto_build: function() {
				if (this.do_auto_build === false) {
					this.render_pending = true;
					this.render();
					$('#jd_busy_kittens_build_toggle').prop('value', 'TURN OFF AUTO-BUILD');
				} else {
					this.render_pending = true;
					this.render();
					$('#jd_busy_kittens_build_toggle').prop('value', 'TURN ON AUTO-BUILD');
				}
				this.do_auto_build = !this.do_auto_build;
			},
			do_auto_craft: false,
			toggle_auto_craft: function() {
				if (this.do_auto_craft === false) {
					$("#jda_busy_kittens_craft_toggle").prop("value", "STOP AUTO-CRAFT");
					this.do_auto_craft = true;
				} else {
					$("#jda_busy_kittens_craft_toggle").prop("value", "START AUTO-CRAFT");
					this.do_auto_craft = false;
				}
			},
			register_tick_handler: function() {
				gamePage.originalTick = gamePage.tick;
				gamePage.tick = function() {
					gamePage.originalTick();
					if (jda_busy_kittens.build.autoObserve === true) {
						$("#gameLog").find("input").click();
					}
					jda_busy_kittens.build.build();
					jda_busy_kittens.build.craft();
					jda_busy_kittens.praiseSun.praise();
				};
			},
			autoObserve: false,
			toggle_auto_observe: function() {
				if (this.autoObserve === true) {
					this.autoObserve = false;
					$("#jda_busy_kittens_toggle_auto_observe").prop("value", "START AUTO-OBSERVE");
				} else {
					this.autoObserve = true;
					$("#jda_busy_kittens_toggle_auto_observe").prop("value", "STOP AUTO-OBSERVE");
				}
			}
		},
		save: {
			clear: function () {
				LCstorage.removeItem("kittensgame.busyKittens");
			},
			save: function() {
				LCstorage["kittensgame.busyKittens"] = JSON.stringify(jda_busy_kittens.build.buildings);
			},
			copyObject: function(source, target) {
				for (var attrname in source) {
					if (typeof source[attrname] === "object") {
						if (typeof target[attrname] === "undefined") {
							target[attrname] = {};
						}
						this.copyObject(source[attrname], target[attrname]);
					} else {
						target[attrname] = source[attrname];
					}
				}
			},
			load: function() {
				if (LCstorage["kittensgame.busyKittens"]) {
					this.copyObject(JSON.parse(LCstorage["kittensgame.busyKittens"]), jda_busy_kittens.build.buildings);
				}
			}
		},
		ui: {
			css_list: {
				main: "http://serwer1314723.home.pl/busy_kittens.css"
			},
			load_single_css: function(filename) {
				var fileref=document.createElement("link");
				fileref.setAttribute("rel", "stylesheet");
				fileref.setAttribute("type", "text/css");
				fileref.setAttribute("href", filename + "?" + (Math.random() * Number.MAX_SAFE_INTEGER));
				document.getElementsByTagName("head")[0].appendChild(fileref);
			},
			load_csses: function() {
				for (var x in this.css_list) {
					this.load_single_css(this.css_list[x]);
				}
			},
			build: function() {
				$('#footerLinks').append(' | <a href="#" onclick="$(\'#autoDiv\').toggle();">BusyKittens</a>');

				$('#importDiv').after('<div id="autoDiv" class="jda_help" style="display:none;">' +
					'<div id="autoDivPane" style="width: 600px;overflow-x: hidden;">' +
						'<div id="jda_busy_kittens_pin_tab" >[pin tab]</div>' +
						'<div id="autoDivCont" ></div>' +
						'<div id="jda_busy_kittens_build" />' +
					'</div>' + 
				'</div>');
				$("#autoDiv").bind("mouseover", function(event) { $("#autoDiv").addClass("fully_shown"); });
				$("#autoDiv").bind("mouseout", function(event) { $("#autoDiv").removeClass("fully_shown"); });
				$("#jda_busy_kittens_pin_tab").bind("click", function(event) {
					if (event.target.pinned === undefined || event.target.pinned === false) {
						$("#autoDiv").css({"width": "600px"});
						this.pinned = true;
						$("#jda_busy_kittens_pin_tab").html("[unpin tab]");
					} else {
						$("#jda_busy_kittens_pin_tab").html("[pin tab]");
						$("#autoDiv").css({"width": ""});
						this.pinned = false;
					}});
				$('#autoDivCont').append('<input id="praiseSun" type="button" value="START AUTO-PRAISE" href="#" onclick="jda_busy_kittens.praiseSun.toggle();"><br>');
				$('#autoDivCont').append('<input id="bkahbutton" type="button" value="START HUNT" href="#" onclick="jda_busy_kittens.hunt.toggle();">');
				$('#autoDivCont').append('<input id="bkahmillis" type="number" value="2000" href="#"><br>');
				$('#bkahmillis').bind("focusout", function() {
					jda_busy_kittens.hunt.huntMillis = parseInt(this.value, 10);
					jda_busy_kittens.hunt.toggle();
					jda_busy_kittens.hunt.toggle();
				});
				$('#autoDivCont').append('<input id="jda_busy_kittens_toggle_auto_observe" type="button" value="START AUTO-OBSERVE" href="#" onclick="jda_busy_kittens.build.toggle_auto_observe();"><br>');
				$('#autoDivCont').append(
					'<input type="button" value="+10" href="#" onclick="jda_busy_kittens.speed.faster(10);">' + 
					'<input type="button" value="+5" href="#" onclick="jda_busy_kittens.speed.faster(5);">' + 
					'<input type="button" value="+1" href="#" onclick="jda_busy_kittens.speed.faster(1);">' + 
					'<input  type="button" id="gamespeedplaystop" href="#" value="STOP" onclick="jda_busy_kittens.speed.toggle();">' +
					'<input type="button" value="STEP" href="#" onclick="jda_busy_kittens.speed.step_single_frame();">' +
					'<span>SPEED: <span id="gamespeedcurrentrate">5</span></span>' +
					'<input  type="button" href="#" value="-1" onclick="jda_busy_kittens.speed.slower(1);">' +
					'<input  type="button" href="#" value="-5" onclick="jda_busy_kittens.speed.slower(5);">' +
					'<input  type="button" href="#" value="-10" onclick="jda_busy_kittens.speed.slower(10);">' +
					'&nbsp;&nbsp;&nbsp;<input type="button" href="#" value="RESET" onclick="jda_busy_kittens.speed.reset();"><br><br>' +
					'<input id="jda_busy_kittens_craft_toggle" type="button" href="#" value="START AUTO-CRAFT" onclick="jda_busy_kittens.build.toggle_auto_craft();">' +
					'<div onclick="jda_busy_kittens.build.toggle_craft_table(this);">[-]</div>' +
					'<div id="jda_busy_kittens_craft_table"/>');
				$('#autoDivCont').append('<br><input id="jd_busy_kittens_build_toggle" type="button" value="TURN ON AUTO-BUILD" onclick="jda_busy_kittens.build.toggle_auto_build(); return false;">');
				$("#autoDivCont").append('<div onclick="jda_busy_kittens.build.toggle_build_table(this);">[-]</div>');
				$('#autoDivCont').append('<div id="jd_build_show_log" onclick="jda_busy_kittens.build.toggle_autobuild_logs(this)">[Hide autobuild logs]</div><br />');
				this.load_csses();
			}
		}
	};
	jda_busy_kittens.ui.build();
	jda_busy_kittens.save.load();
	jda_busy_kittens.build.register_tick_handler();
	jda_busy_kittens.build.initialize_crafts();
	jda_busy_kittens.huntAllOriginal = gamePage.village.huntAll;
	gamePage.village.huntAll = function() {
		jda_busy_kittens.huntAllOriginal.call(gamePage.village);
	}
}

if (window.jda_busy_kittens === undefined) {
	jda_busy_kittens_initialise();
}
