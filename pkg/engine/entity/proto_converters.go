package entity

// ReplayRoundToProtoPB converts entity.ReplayRound to protobuf message
func ReplayRoundToProtoPB(round *ReplayRound) *ReplayRoundPB {
	if round == nil {
		return nil
	}

	protoRound := &ReplayRoundPB{
		Uuid:  round.UUID,
		Round: int32(round.Round),
	}

	// Convert frames
	if round.Frames != nil {
		protoRound.Frames = make([]*FramePB, len(round.Frames))
		for i, frame := range round.Frames {
			protoRound.Frames[i] = FrameToProtoPB(&frame)
		}
	}

	return protoRound
}

// FrameToProtoPB converts entity.Frame to protobuf message
func FrameToProtoPB(frame *Frame) *FramePB {
	if frame == nil {
		return nil
	}

	protoFrame := &FramePB{
		TimeMs:        frame.TimeMs,
		Tick:          int32(frame.Tick),
		Round:         int32(frame.Round),
		SortedPlayers: convertIntSliceToInt32(frame.SortedPlayers),
		SortedProjs:   convertIntSliceToInt32(frame.SortedProjs),
	}

	// Convert round time info
	if frame.RoundTime.Phase != "" {
		protoFrame.RoundTime = &RoundTimeInfoPB{
			Phase:         string(frame.RoundTime.Phase),
			TimeRemaining: frame.RoundTime.TimeRemaining,
		}
	}

	// Convert players map
	if frame.Players != nil {
		protoFrame.Players = make(map[int32]*PlayerFramePB)
		for k, v := range frame.Players {
			protoFrame.Players[int32(k)] = PlayerFrameToProtoPB(&v)
		}
	}

	// Convert kill events map
	if frame.KillEvents != nil {
		protoFrame.KillEvents = make(map[int32]*KillEventPB)
		for k, v := range frame.KillEvents {
			protoFrame.KillEvents[int32(k)] = &KillEventPB{
				KillerId:    int32(v.KillerID),
				AssistantId: int32(v.AssistantID),
				WeaponId:    int32(v.WeaponID),
			}
		}
	}

	// Convert projectiles map
	if frame.Projectiles != nil {
		protoFrame.Projectiles = make(map[int32]*ProjectileFramePB)
		for k, v := range frame.Projectiles {
			protoFrame.Projectiles[int32(k)] = ProjectileFrameToProtoPB(&v)
		}
	}

	// Convert dropped equipment
	if frame.DroppedEquipment != nil {
		protoFrame.DroppedEquipment = make([]*DroppedEquipmentPB, len(frame.DroppedEquipment))
		for i, de := range frame.DroppedEquipment {
			protoFrame.DroppedEquipment[i] = &DroppedEquipmentPB{
				Type: int32(de.Type),
				X:    de.X,
				Y:    de.Y,
				Z:    de.Z,
			}
		}
	}

	// Convert bomb frame
	if frame.Bomb != nil {
		protoFrame.Bomb = &BombFramePB{
			X:         frame.Bomb.X,
			Y:         frame.Bomb.Y,
			Z:         frame.Bomb.Z,
			IsPlanted: frame.Bomb.IsPlanted,
			State:     frame.Bomb.State,
			Site:      frame.Bomb.Site,
		}
	}

	return protoFrame
}

// PlayerFrameToProtoPB converts entity.PlayerFrame to protobuf message
func PlayerFrameToProtoPB(player *PlayerFrame) *PlayerFramePB {
	if player == nil {
		return nil
	}

	protoPlayer := &PlayerFramePB{
		Id:                  int32(player.ID),
		Name:                player.Name,
		Team:                int32(player.Team),
		X:                   player.X,
		Y:                   player.Y,
		Z:                   player.Z,
		Yaw:                 player.Yaw,
		Pitch:               player.Pitch,
		Alive:               player.Alive,
		Health:              int32(player.Health),
		Armor:               int32(player.Armor),
		Money:               int32(player.Money),
		HasHelmet:           player.HasHelmet,
		HasDefuseKit:        player.HasDefuseKit,
		IsScoped:            player.IsScoped,
		FlashDuration:       player.FlashDuration,
		IsBlinded:           player.IsBlinded,
		ActiveWeapon:        int32(player.ActiveWeapon),
		Kills:               int32(player.Kills),
		Assists:             int32(player.Assists),
		Deaths:              int32(player.Deaths),
		MoneySpentTotal:     int32(player.MoneySpentTotal),
		MoneySpentThisRound: int32(player.MoneySpentThisRound),
		EquipmentValue:      int32(player.EquipmentValue),
		SteamId:             player.SteamID,
		IsBot:               player.IsBot,
	}

	// Convert inventory
	if player.Inventory != nil {
		protoPlayer.Inventory = make([]int32, len(player.Inventory))
		for i, item := range player.Inventory {
			protoPlayer.Inventory[i] = int32(item)
		}
	}

	// Convert buttons
	if player.Buttons != nil {
		protoPlayer.Buttons = player.Buttons
	}

	return protoPlayer
}

// ProjectileFrameToProtoPB converts entity.ProjectileFrame to protobuf message
func ProjectileFrameToProtoPB(proj *ProjectileFrame) *ProjectileFramePB {
	if proj == nil {
		return nil
	}

	protoProj := &ProjectileFramePB{
		Type:        int32(proj.Type),
		X:           proj.X,
		Y:           proj.Y,
		Z:           proj.Z,
		ThrowerName: proj.ThrowerName,
		ThrowerId:   int32(proj.ThrowerID),
		EntityId:    int32(proj.EntityID),
		IsExploded:  proj.IsExploded,
		Ttl:         proj.TTL,
	}

	// Convert trajectory
	if proj.Trajectory != nil {
		protoProj.Trajectory = make([]*PointPB, len(proj.Trajectory))
		for i, point := range proj.Trajectory {
			protoProj.Trajectory[i] = &PointPB{
				X: point.X,
				Y: point.Y,
				Z: point.Z,
			}
		}
	}

	return protoProj
}

// Helper function to convert []int to []int32
func convertIntSliceToInt32(slice []int) []int32 {
	if slice == nil {
		return nil
	}
	result := make([]int32, len(slice))
	for i, v := range slice {
		result[i] = int32(v)
	}
	return result
}
